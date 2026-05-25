const collectionRouter = require('express').Router();
const { db_Select, db_Insert } = require('../../controllers/common_controller');
const bcrypt = require('bcrypt'); // Added bcrypt requirement

// GET /search
collectionRouter.get('/search', async (req, res) => {
    const { q, agent_code, school_id, agent_trans_no } = req.query;
    if (!q || !agent_code || !school_id || q.length < 3) {
        return res.json({ suc: 0, msg: "Search query must be at least 3 characters." });
    }

    try {
        let trans_no = agent_trans_no;
        
        // Dynamic fallback: look up live transaction period if not supplied
        if (!trans_no) {
            const activeTrans = await db_Select('agent_trans_no', 'md_agent_trans', 'school_id = ? AND agent_code = ? AND coll_flag = "Y" AND end_flag = "N"', 'ORDER BY sl_no DESC LIMIT 1', [school_id, agent_code]);
            if (activeTrans.suc > 0 && activeTrans.msg.length > 0) {
                trans_no = activeTrans.msg[0].agent_trans_no;
            }
        }

        let whr_clause = "agent_code = ? AND school_id = ? AND (student_name LIKE ? OR guardian_name LIKE ? OR contact_no LIKE ?)";
        let params = [agent_code, school_id, `%${q}%`, `%${q}%`, `%${q}%`];

        if (trans_no) {
            whr_clause = "agent_code = ? AND school_id = ? AND agent_trans_no = ? AND (student_name LIKE ? OR guardian_name LIKE ? OR contact_no LIKE ?)";
            params = [agent_code, school_id, trans_no, `%${q}%`, `%${q}%`, `%${q}%`];
        }

        const sql = `
            SELECT account_dtls_id, class_no, roll_no, student_name, guardian_name, contact_no, depost_amt, curr_bal
            FROM td_account_dtls
            WHERE ${whr_clause}
            ORDER BY student_name ASC
            LIMIT 50
        `;
        const accounts = await db_Select(null, null, null, null, params, true, sql);

        res.json({ suc: 1, msg: accounts.suc > 0 ? accounts.msg : [] });
    } catch (error) {
        console.error("Search Error:", error);
        res.json({ suc: 0, msg: "Search failed" });
    }
});

// GET /account/:id
collectionRouter.get('/account/:id', async (req, res) => {
    const account_dtls_id = req.params.id;
    try {
        const account = await db_Select('*', 'td_account_dtls', 'account_dtls_id = ?', null, [account_dtls_id]);
        if (account.suc > 0 && account.msg.length > 0) {
            res.json({ suc: 1, data: account.msg[0] });
        } else {
            res.json({ suc: 0, msg: "Account not found" });
        }
    } catch (error) {
        res.json({ suc: 0, msg: "Database error" });
    }
});

// GET /eligibility
collectionRouter.get('/eligibility', async (req, res) => {
    const { agent_code, school_id } = req.query;
    try {
        // 1. Check md_agent_trans
        const transSelect = await db_Select('*', 'md_agent_trans', 'agent_code = ? AND school_id = ?', 'ORDER BY sl_no DESC LIMIT 1', [agent_code, school_id]);
        if (transSelect.suc <= 0 || transSelect.msg.length === 0) {
             return res.json({ suc: 1, can_collect: false, reason: "No active transaction period found. Admin needs to upload data." });
        }
        
        const trans = transSelect.msg[0];
        if (trans.end_flag === 'Y' || trans.coll_flag === 'N') {
            return res.json({ suc: 1, can_collect: false, reason: "Work ended. Collections are closed for the current dataset." });
        }

        // 2. Check md_agent settings (allow_collection_days, max_amt)
        const agentSelect = await db_Select('allow_collection_days, max_amt', 'md_agent', 'agent_code = ? AND school_id = ?', null, [agent_code, school_id]);
        if (agentSelect.suc > 0 && agentSelect.msg.length > 0) {
            const agent = agentSelect.msg[0];
            const sendDate = new Date(trans.send_date);
            const currentDate = new Date();
            const daysDiff = Math.floor((currentDate - sendDate) / (1000 * 60 * 60 * 24));

            if (daysDiff > agent.allow_collection_days) {
                 return res.json({ suc: 1, can_collect: false, reason: `Collection time limit exceeded (${agent.allow_collection_days} days).` });
            }

            // 3. Check total collected amount in this trans period
            const totalCollSelect = await db_Select('SUM(deposit_amount) as total', 'td_collection', 'agent_trans_no = ?', null, [trans.agent_trans_no]);
            let totalCollected = totalCollSelect.suc > 0 && totalCollSelect.msg[0].total ? totalCollSelect.msg[0].total : 0;
            
            if (totalCollected >= agent.max_amt * agent.allow_collection_days) { // Max amount logic based on requirements
                 return res.json({ suc: 1, can_collect: false, reason: "Maximum collection amount reached." });
            }
            
            return res.json({ suc: 1, can_collect: true, agent_trans_no: trans.agent_trans_no });
        } else {
             return res.json({ suc: 1, can_collect: false, reason: "Agent settings not found." });
        }
    } catch (error) {
        console.error("Eligibility Error:", error);
        res.json({ suc: 0, msg: "Internal error checking eligibility" });
    }
});

// POST /save
collectionRouter.post('/save', async (req, res) => {
    const { school_id, agent_code, agent_trans_no, account_dtls_id, deposit_amount, collection_month, remarks, student_name, guardian_name } = req.body;
    
    try {
        const receipt_no = Date.now(); // 13 digit timestamp
        const transaction_date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const collected_at = new Date().toISOString().slice(0, 19).replace('T', ' '); // YYYY-MM-DD HH:MM:SS
        
        // Calculate balance_amount: deposit amount - cumulative collected amount
        let balance_amount = 0;
        try {
            // 1. Fetch deposit amount from td_account_dtls
            const accountSelect = await db_Select('depost_amt', 'td_account_dtls', 'account_dtls_id = ?', null, [account_dtls_id]);
            let depost_amt = 0;
            if (accountSelect.suc > 0 && accountSelect.msg.length > 0) {
                depost_amt = parseFloat(accountSelect.msg[0].depost_amt) || 0;
            }

            // 2. Fetch sum of previous collections for this account_dtls_id
            const prevSelect = await db_Select('SUM(deposit_amount) as total_prev', 'td_collection', 'account_dtls_id = ?', null, [account_dtls_id]);
            let total_prev = 0;
            if (prevSelect.suc > 0 && prevSelect.msg.length > 0) {
                total_prev = parseFloat(prevSelect.msg[0].total_prev) || 0;
            }

            // 3. Compute remaining balance amount
            const current_deposit = parseFloat(deposit_amount) || 0;
            balance_amount = depost_amt - (total_prev + current_deposit);
        } catch (calcError) {
            console.error("Error calculating balance amount:", calcError);
            balance_amount = 0;
        }
        
        const fields = '(receipt_no, agent_trans_no, school_id, agent_code, transaction_date, account_dtls_id, student_name, guardian_name, deposit_amount, balance_amount, collection_month, remarks, collection_by, collected_at)';
        const values = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const params = [receipt_no, agent_trans_no, school_id, agent_code, transaction_date, account_dtls_id, student_name, guardian_name, deposit_amount, balance_amount, collection_month, remarks, req.user.id, collected_at];

        const result = await db_Insert('td_collection', fields, values, null, 0, params);
        
        if (result.suc > 0) {
            res.json({ suc: 1, msg: "Collection saved successfully", receipt_no });
        } else {
            res.json({ suc: 0, msg: "Failed to save collection: " + result.msg });
        }
    } catch (error) {
        console.error("Save Collection Error:", error);
        res.json({ suc: 0, msg: "Database error" });
    }
});

// POST /end-work
collectionRouter.post('/end-work', async (req, res) => {
    const { school_id, agent_code, password } = req.body;
    
    try {
        // Verify password
        const userSelect = await db_Select('password', 'md_user', 'id = ?', null, [req.user.id]);
        if (userSelect.suc <= 0 || userSelect.msg.length === 0) {
            return res.json({ suc: 0, msg: "User not found" });
        }
        
        const user = userSelect.msg[0];
        
        // Robust PIN matching with bcrypt and plain-text fallback
        let passMatch = false;
        try {
            passMatch = await bcrypt.compare(password, user.password);
        } catch (e) {
            passMatch = (password === user.password);
        }
        
        if (!passMatch) {
            passMatch = (password === user.password);
        }
        
        if (!passMatch) {
            return res.json({ suc: 0, msg: "Incorrect PIN" });
        }

        // Update md_agent_trans correctly using the db_Insert helper
        const fields = "end_flag = 'Y', coll_flag = 'N'";
        const whr = "agent_code = ? AND school_id = ? AND end_flag = 'N'";
        const result = await db_Insert('md_agent_trans', fields, null, whr, 1, [agent_code, school_id]);
        
        if (result.suc > 0) {
            res.json({ suc: 1, msg: "Work ended successfully." });
        } else {
            res.json({ suc: 0, msg: "Failed to update status: " + result.msg });
        }

    } catch (error) {
         console.error("End Work Error:", error);
         res.json({ suc: 0, msg: "Internal server error" });
    }
});

module.exports = { collectionRouter };
