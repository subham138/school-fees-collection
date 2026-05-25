const upDwRouter = require('express').Router()
const { db_Select, db_Insert, db_Delete } = require('../../controllers/common_controller');
const dateFormat = require('dateformat');

upDwRouter.use((req, res, next) => {
    res.locals.currentPage = 'upload';
    next();
})

// GET / - Render upload page
upDwRouter.get('/', async (req, res) => {
    const user = req.session.user.user_data;
    let school_data = [];
    let agent_data = [];
    
    try {
        if (user.user_type === 'A') {
            // Super Admin: Fetch all active schools
            const schools = await db_Select('school_id, school_name', 'md_school', 'delete_flag = "N" AND active_flag = "Y"', null);
            school_data = schools.suc > 0 ? schools.msg : [];
        } else {
            // Regular Admin: Fetch active agents belonging to admin's school
            const agents = await db_Select('agent_id, school_id, agent_code, agent_name', 'md_agent', 'school_id = ? AND delete_flag = "N" AND active_flag = "Y"', null, [user.school_id]);
            agent_data = agents.suc > 0 ? agents.msg : [];
        }
    } catch (err) {
        console.error("Error loading upload page routes:", err);
    }
    
    res.render('pages/up_vi_dwn_data/upload', {
        title: 'Upload Data',
        school_data,
        agent_data,
        user_type: user.user_type,
        dateFormat
    });
})

// GET /agents/:school_id - AJAX get school agents (Super Admin)
upDwRouter.get('/agents/:school_id', async (req, res) => {
    const school_id = req.params.school_id;
    try {
        const agents = await db_Select('agent_id, school_id, agent_code, agent_name', 'md_agent', 'school_id = ? AND delete_flag = "N" AND active_flag = "Y"', null, [school_id]);
        res.json({ suc: 1, msg: agents.suc > 0 ? agents.msg : [] });
    } catch (err) {
        res.json({ suc: 0, msg: 'Error fetching agents' });
    }
})

// GET /agent-info - AJAX get agent preview & upload availability check
upDwRouter.get('/agent-info', async (req, res) => {
    const { school_id, agent_code } = req.query;
    if (!school_id || !agent_code) {
        return res.json({ suc: 0, msg: 'Missing school_id or agent_code' });
    }
    
    try {
        // 1. Fetch Agent basic info
        const agent = await db_Select('agent_name, agent_code, max_amt, allow_collection_end_dt', 'md_agent', 'school_id = ? AND agent_code = ? AND delete_flag = "N"', null, [school_id, agent_code]);
        if (agent.suc <= 0 || agent.msg.length === 0) {
            return res.json({ suc: 0, msg: 'Agent not found' });
        }
        
        // 2. Fetch Latest Upload Date
        const last_upload = await db_Select('MAX(upload_dt) as last_upload_dt', 'td_account_dtls', 'school_id = ? AND agent_code = ?', null, [school_id, agent_code]);
        const last_upload_dt = last_upload.msg[0]?.last_upload_dt || null;
        
        // 3. Status checks:
        let allow_upload = true;
        let block_reason = "";
        
        // Check td_collection for active undownloaded collections
        const undownloaded = await db_Select('COUNT(*) as count', 'td_collection', 'school_id = ? AND agent_code = ? AND download_flag = "N"', null, [school_id, agent_code]);
        if (undownloaded.suc > 0 && undownloaded.msg[0].count > 0) {
            allow_upload = false;
            block_reason = "Collection data has not been fully synced. There are undownloaded records on the device.";
        } else {
            // Check md_agent_trans for collection in progress (coll_flag='Y' or end_flag='N')
            const last_trans = await db_Select('coll_flag, end_flag', 'md_agent_trans', 'school_id = ? AND agent_code = ?', 'ORDER BY sl_no DESC LIMIT 1', [school_id, agent_code]);
            if (last_trans.suc > 0 && last_trans.msg.length > 0) {
                const trans = last_trans.msg[0];
                if (trans.coll_flag !== 'N' || trans.end_flag !== 'Y') {
                    allow_upload = false;
                    block_reason = "Collection is in progress. The agent must end-work and post collections to the bank before uploading a new dataset.";
                }
            }
        }
        
        res.json({
            suc: 1,
            agent_info: agent.msg[0],
            last_upload_dt,
            allow_upload,
            block_reason
        });
    } catch (err) {
        console.error("Error checking agent info:", err);
        res.json({ suc: 0, msg: 'Database query error' });
    }
})

// POST /upload-chunk - AJAX insert chunk of records
upDwRouter.post('/upload-chunk', async (req, res) => {
    const { school_id, agent_code, agent_trans_no, rows, is_first_chunk } = req.body;
    const user = req.session.user.user_data;
    
    if (!school_id || !agent_code || !rows || !Array.isArray(rows)) {
        return res.json({ suc: 0, msg: 'Invalid payload' });
    }
    
    try {
        // If it is the first chunk, clear any existing student accounts for this agent
        if (is_first_chunk) {
            await db_Delete('td_account_dtls', 'school_id = ? AND agent_code = ?', [school_id, agent_code]);
        }
        
        if (rows.length > 0) {
            // Build high-performance multi-row bulk insert query without curr_bal
            let sql = `(school_id, agent_code, agent_trans_no, class_no, roll_no, student_name, guardian_name, contact_no, depost_amt, upload_dt, uploaded_by) VALUES `;
            let val_arr = [];
            let params = [];
            
            rows.forEach(row => {
                val_arr.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                params.push(
                    parseInt(school_id),
                    agent_code,
                    agent_trans_no || null,
                    row.class_no ? row.class_no.toString().substring(0, 10) : null,
                    row.roll_no ? row.roll_no.toString().substring(0, 20) : null,
                    row.student_name ? row.student_name.toString().substring(0, 50) : null,
                    row.guardian_name ? row.guardian_name.toString().substring(0, 50) : null,
                    row.contact_no ? row.contact_no.toString().substring(0, 50) : null,
                    parseFloat(row.depost_amt) || 0.00,
                    dateFormat(new Date(), "yyyy-mm-dd"),
                    user.id || 0
                );
            });
            
            sql += val_arr.join(', ');
            const result = await db_Insert('td_account_dtls', null, null, null, 0, params, true, sql);
            if (result.suc <= 0) {
                return res.json({ suc: 0, msg: 'Insert failed: ' + result.msg });
            }
        }
        
        res.json({ suc: 1, msg: 'Chunk processed successfully' });
    } catch (err) {
        console.error("Error uploading chunk batch:", err);
        res.json({ suc: 0, msg: 'Internal processing error' });
    }
})

// POST /complete-upload - AJAX finalise and insert record in md_agent_trans
upDwRouter.post('/complete-upload', async (req, res) => {
    const { school_id, agent_code, agent_trans_no } = req.body;
    if (!school_id || !agent_code || !agent_trans_no) {
        return res.json({ suc: 0, msg: 'Missing school_id, agent_code, or agent_trans_no' });
    }
    
    try {
        const fields = '(agent_trans_no, school_id, agent_code, coll_flag, send_date, end_flag)';
        const values = '(?, ?, ?, ?, ?, ?)';
        const params = [
            agent_trans_no,
            parseInt(school_id),
            agent_code,
            'Y',
            dateFormat(new Date(), "yyyy-mm-dd"),
            'N'
        ];
        
        const result = await db_Insert('md_agent_trans', fields, values, null, 0, params);
        if (result.suc > 0) {
            res.json({ suc: 1, msg: 'Upload finalised successfully', agent_trans_no });
        } else {
            res.json({ suc: 0, msg: 'Failed to record trans record: ' + result.msg });
        }
    } catch (err) {
        console.error("Error finalising upload transaction:", err);
        res.json({ suc: 0, msg: 'Transaction finalisation database error' });
    }
})

// GET /view - View uploaded account details
upDwRouter.get('/view', async (req, res) => {
    res.locals.currentPage = 'view_uploaded';
    const user = req.session.user.user_data;
    let school_data = [];
    let agent_data = [];
    let accounts = [];
    let collection_active = null; // null = select agent first, true = active collection with roster data, false = collection has ended
    
    const selected_school_id = user.user_type === 'A' ? (req.query.school_id || '') : user.school_id;
    const selected_agent_code = req.query.agent_code || '';
    
    try {
        if (user.user_type === 'A') {
            // Super Admin: Fetch all active schools
            const schools = await db_Select('school_id, school_name', 'md_school', 'delete_flag = "N" AND active_flag = "Y"', null);
            school_data = schools.suc > 0 ? schools.msg : [];
            
            if (selected_school_id) {
                // Fetch agents for the selected school
                const agents = await db_Select('agent_id, school_id, agent_code, agent_name', 'md_agent', 'school_id = ? AND delete_flag = "N" AND active_flag = "Y"', null, [selected_school_id]);
                agent_data = agents.suc > 0 ? agents.msg : [];
            }
        } else {
            // Regular Admin: Fetch agents for their own school
            const agents = await db_Select('agent_id, school_id, agent_code, agent_name', 'md_agent', 'school_id = ? AND delete_flag = "N" AND active_flag = "Y"', null, [user.school_id]);
            agent_data = agents.suc > 0 ? agents.msg : [];
        }
        
        if (selected_school_id && selected_agent_code) {
            // Check if active transaction exists: coll_flag = 'Y' and end_flag = 'N'
            const trans = await db_Select('agent_trans_no, coll_flag, end_flag', 'md_agent_trans', 'school_id = ? AND agent_code = ?', 'ORDER BY sl_no DESC LIMIT 1', [selected_school_id, selected_agent_code]);
            
            if (trans.suc > 0 && trans.msg.length > 0 && trans.msg[0].coll_flag === 'Y' && trans.msg[0].end_flag === 'N') {
                collection_active = true;
                const active_trans_no = trans.msg[0].agent_trans_no;
                const accounts_data = await db_Select('*', 'td_account_dtls', 'school_id = ? AND agent_code = ? AND agent_trans_no = ?', 'ORDER BY account_dtls_id ASC', [selected_school_id, selected_agent_code, active_trans_no]);
                accounts = accounts_data.suc > 0 ? accounts_data.msg : [];
            } else {
                collection_active = false;
            }
        }
    } catch (err) {
        console.error("Error loading view uploaded data page:", err);
    }
    
    res.render('pages/up_vi_dwn_data/view', {
        title: 'View Uploaded Roster',
        school_data,
        agent_data,
        accounts,
        collection_active,
        selected_school_id,
        selected_agent_code,
        user_type: user.user_type,
        dateFormat
    });
});

// GET /send - Search ended collections and list them grouped by transaction
upDwRouter.get('/send', async (req, res) => {
    res.locals.currentPage = 'send_banking';
    const user = req.session.user.user_data;
    
    // Date calculation helper
    const todayStr = dateFormat(new Date(), "yyyy-mm-dd");
    const dateObj = new Date();
    // Default from_date to 1st day of current month
    const firstDayOfMonthStr = dateFormat(new Date(dateObj.getFullYear(), dateObj.getMonth(), 1), "yyyy-mm-dd");
    
    const from_date = req.query.from_date || firstDayOfMonthStr;
    const to_date = req.query.to_date || todayStr;
    const selected_school_id = user.user_type === 'A' ? (req.query.school_id || '') : user.school_id;
    
    let school_data = [];
    let transactions = [];
    
    try {
        if (user.user_type === 'A') {
            // Super Admin: Fetch all active schools
            const schools = await db_Select('school_id, school_name', 'md_school', 'delete_flag = "N" AND active_flag = "Y"', null);
            school_data = schools.suc > 0 ? schools.msg : [];
        }
        
        // Build the ended collections query
        // Session ended condition: end_flag = 'Y'
        // Filter by school and date range
        let queryParams = [from_date, to_date];
        let schoolFilter = "";
        
        if (selected_school_id) {
            schoolFilter = "AND t.school_id = ?";
            queryParams.push(parseInt(selected_school_id));
        }
        
        const fullQuerySql = `
            SELECT 
                t.agent_trans_no,
                t.school_id,
                s.school_name,
                t.agent_code,
                a.agent_name,
                t.send_date,
                COALESCE(SUM(c.deposit_amount), 0) AS total_deposit_amt,
                COUNT(c.receipt_no) as total_collections,
                SUM(CASE WHEN c.download_flag = 'N' THEN 1 ELSE 0 END) as pending_count
            FROM md_agent_trans t
            INNER JOIN md_school s ON t.school_id = s.school_id
            INNER JOIN md_agent a ON t.school_id = a.school_id AND t.agent_code = a.agent_code
            LEFT JOIN td_collection c ON t.agent_trans_no = c.agent_trans_no
            WHERE t.end_flag = 'Y' AND t.send_date BETWEEN ? AND ? ${schoolFilter}
            GROUP BY t.agent_trans_no, t.school_id, s.school_name, t.agent_code, a.agent_name, t.send_date, t.sl_no
            ORDER BY t.send_date DESC, t.sl_no DESC
        `;
        
        const transResult = await db_Select(null, null, null, null, queryParams, true, fullQuerySql);
        transactions = transResult.suc > 0 ? transResult.msg : [];
    } catch (err) {
        console.error("Error loading send to banking page:", err);
    }
    
    res.render('pages/up_vi_dwn_data/send', {
        title: 'Send to Banking',
        school_data,
        transactions,
        from_date,
        to_date,
        selected_school_id,
        user_type: user.user_type,
        dateFormat
    });
});

// GET /collection-details/:agent_trans_no - Fetch all individual collected records under a transaction number
upDwRouter.get('/collection-details/:agent_trans_no', async (req, res) => {
    const agent_trans_no = req.params.agent_trans_no;
    try {
        // Query td_collection details for this transaction
        const collections = await db_Select(
            'receipt_no, student_name, guardian_name, deposit_amount, balance_amount, transaction_date, download_flag, pay_mode',
            'td_collection',
            'agent_trans_no = ?',
            'ORDER BY receipt_no ASC',
            [agent_trans_no]
        );
        
        if (collections.suc > 0) {
            res.json({ suc: 1, msg: collections.msg });
        } else {
            res.json({ suc: 0, msg: 'No collections found or error occurred' });
        }
    } catch (err) {
        console.error("Error fetching collection details:", err);
        res.json({ suc: 0, msg: 'Internal server error' });
    }
});

// POST /upload-to-banking - Simulate uploading/sending all collected records under a transaction to the bank
upDwRouter.post('/upload-to-banking', async (req, res) => {
    const { agent_trans_no } = req.body;
    const user = req.session.user.user_data;
    
    if (!agent_trans_no) {
        return res.json({ suc: 0, msg: 'Missing agent_trans_no' });
    }
    
    try {
        // 1. Retrieve transaction info to get school_id and agent_code
        const transResult = await db_Select(
            'school_id, agent_code',
            'md_agent_trans',
            'agent_trans_no = ?',
            null,
            [agent_trans_no]
        );
        
        if (transResult.suc <= 0 || transResult.msg.length === 0) {
            return res.json({ suc: 0, msg: 'Transaction session not found' });
        }
        
        const trans = transResult.msg[0];
        
        // 2. Select data for banking transmission simulation
        const collectionsResult = await db_Select(
            '*',
            'td_collection',
            'agent_trans_no = ? AND download_flag = "N"',
            null,
            [agent_trans_no]
        );
        
        if (collectionsResult.suc > 0) {
            const collections = collectionsResult.msg;
            console.log(`Simulating bank transmission of \${collections.length} records for Txn \${agent_trans_no}...`);
        }
        
        // 3. Update download_flag to 'Y' in td_collection
        const updateResult = await db_Insert(
            'td_collection',
            'download_flag = "Y"',
            null,
            'agent_trans_no = ? AND download_flag = "N"',
            1,
            [agent_trans_no]
        );
        
        if (updateResult.suc > 0) {
            // 4. Log the manual banking transaction transmission in md_trans_log
            const fields = '(agent_trans_no, school_id, agent_code, send_date, send_by, send_type, created_by, created_dt)';
            const values = '(?, ?, ?, ?, ?, ?, ?, ?)';
            const params = [
                agent_trans_no,
                trans.school_id,
                trans.agent_code,
                dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss"),
                user.user_id || 'admin',
                'M', // Manual send_type
                user.user_id || 'admin',
                dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss")
            ];
            
            await db_Insert('md_trans_log', fields, values, null, 0, params);
            
            res.json({ suc: 1, msg: 'Collection data successfully uploaded to the banking server.' });
        } else {
            res.json({ suc: 0, msg: 'Failed to update upload status: ' + updateResult.msg });
        }
    } catch (err) {
        console.error("Error processing banking upload:", err);
        res.json({ suc: 0, msg: 'Database processing error occurred' });
    }
});

module.exports = {upDwRouter};