const agentRouter = require('express').Router()
const { db_Select, db_Insert } = require('../../controllers/common_controller');
const dateFormat = require('dateformat');
const bcrypt = require('bcrypt');

agentRouter.use((req, res, next) => {
    res.locals.currentPage = 'agent';
    next();
})

// View all agents (role-based)
agentRouter.get('/', async (req, res) => {
    const user = req.session.user.user_data;
    let school_data = [];
    let agent_data = [];
    
    try {
        if (user.user_type === 'A') {
            // Super Admin: Fetch all non-deleted schools for top-level selection dropdown
            const schools = await db_Select('school_id, school_name', 'md_school', 'delete_flag = "N"', null);
            school_data = schools.suc > 0 ? schools.msg : [];
            
            // Fetch all non-deleted agents from all schools with joined school_name
            const agents = await db_Select(
                'a.agent_id, a.school_id, b.school_name, a.agent_code, a.agent_name, a.phone_no, a.max_amt, a.active_flag',
                'md_agent a LEFT JOIN md_school b ON a.school_id = b.school_id',
                'a.delete_flag = "N"',
                null
            );
            agent_data = agents.suc > 0 ? agents.msg : [];
        } else {
            // Regular Admin: Fetch only agents belonging to the admin's specific school
            const agents = await db_Select(
                'a.agent_id, a.school_id, b.school_name, a.agent_code, a.agent_name, a.phone_no, a.max_amt, a.active_flag',
                'md_agent a LEFT JOIN md_school b ON a.school_id = b.school_id',
                'a.delete_flag = "N" AND a.school_id = ?',
                null,
                [user.school_id]
            );
            agent_data = agents.suc > 0 ? agents.msg : [];
        }
    } catch (err) {
        console.error("Error fetching agents view data:", err);
    }
    
    res.render('pages/agents/view', {
        title: 'Agent Management',
        school_data,
        agent_data,
        user_type: user.user_type,
        dateFormat
    });
})

// Manage Agent GET/POST
agentRouter.all('/manage', async (req, res) => {
    const request = req.method;
    const user = req.session.user.user_data;
    
    if (request === 'GET') {
        let agent_id = parseInt(req.query.id) || 0;
        let school_data = [];
        
        try {
            // Pre-fetch all schools if super admin, or specific admin school name
            if (user.user_type === 'A') {
                const schools = await db_Select('school_id, school_name', 'md_school', 'delete_flag = "N" AND active_flag = "Y"', null);
                school_data = schools.suc > 0 ? schools.msg : [];
            } else {
                const school = await db_Select('school_id, school_name', 'md_school', 'school_id = ?', null, [user.school_id]);
                school_data = school.suc > 0 ? school.msg : [];
            }
            
            if (agent_id > 0) {
                // Fetch agent info
                const agent = await db_Select('*', 'md_agent', 'agent_id = ? AND delete_flag = "N"', null, [agent_id]);
                if (agent.suc > 0 && agent.msg.length > 0) {
                    const agent_info = agent.msg[0];
                    // Fetch device_id from md_user
                    const user_rec = await db_Select('device_id', 'md_user', 'school_id = ? AND user_id = ? AND user_type = "O"', null, [agent_info.school_id, agent_info.agent_code]);
                    if (user_rec.suc > 0 && user_rec.msg.length > 0) {
                        agent_info.device_id = user_rec.msg[0].device_id;
                    } else {
                        agent_info.device_id = '';
                    }

                    res.render('pages/agents/entry', {
                        title: 'Manage Agent',
                        agent_data: agent_info,
                        agent_id,
                        school_data,
                        user_type: user.user_type,
                        dateFormat
                    });
                } else {
                    req.flash('error_msg', 'Agent not found');
                    res.redirect('/admin/agent');
                }
            } else {
                // Fresh creation
                res.render('pages/agents/entry', {
                    title: 'Manage Agent',
                    agent_data: {},
                    agent_id: 0,
                    school_data,
                    user_type: user.user_type,
                    dateFormat
                });
            }
        } catch (err) {
            console.error("Error loading agent manage page:", err);
            req.flash('error_msg', 'Internal server error occurred');
            res.redirect('/admin/agent');
        }
    } else if (request === 'POST') {
        const reqData = req.body;
        const agent_id = parseInt(reqData.agent_id) || 0;
        
        // Select correct school id based on role
        const school_id = user.user_type === 'A' ? parseInt(reqData.school_id) : user.school_id;
        
        const agent_code = reqData.agent_code;
        const agent_name = reqData.agent_name;
        const agent_address = reqData.agent_address || null;
        const phone_no = reqData.phone_no;
        const email_id = reqData.email_id || null;
        const max_amt = parseFloat(reqData.max_amt) || 0.00;
        const allow_collection_days = parseInt(reqData.allow_collection_days) || 1;
        const allow_collection_str_dt = reqData.allow_collection_str_dt || null;
        const allow_collection_end_dt = reqData.allow_collection_end_dt || null;
        const account_no = reqData.account_no || null;
        const printer_type = reqData.printer_type || 'ESCPOS';
        const print_opt = reqData.print_opt || '2';
        const active_flag = reqData.active_flag || 'Y';
        const device_id = reqData.device_id || null;
        
        try {
            // Keep track of the original school_id and agent_code in case they were updated
            let original_school_id = school_id;
            let original_agent_code = agent_code;
            if (agent_id > 0) {
                const orig_agent = await db_Select('school_id, agent_code', 'md_agent', 'agent_id = ?', null, [agent_id]);
                if (orig_agent.suc > 0 && orig_agent.msg.length > 0) {
                    original_school_id = orig_agent.msg[0].school_id;
                    original_agent_code = orig_agent.msg[0].agent_code;
                }
            }

            let result;
            if (agent_id > 0) {
                // Update Agent details
                const fields = 'school_id=?, agent_code=?, agent_name=?, agent_address=?, phone_no=?, email_id=?, max_amt=?, allow_collection_days=?, allow_collection_str_dt=?, allow_collection_end_dt=?, account_no=?, printer_type=?, print_opt=?, active_flag=?';
                const params = [school_id, agent_code, agent_name, agent_address, phone_no, email_id, max_amt, allow_collection_days, allow_collection_str_dt, allow_collection_end_dt, account_no, printer_type, print_opt, active_flag, agent_id];
                result = await db_Insert('md_agent', fields, null, 'agent_id=?', 1, params);
            } else {
                // Insert New Agent
                const fields = '(school_id, agent_code, agent_name, agent_address, phone_no, email_id, max_amt, allow_collection_days, allow_collection_str_dt, allow_collection_end_dt, account_no, printer_type, print_opt, active_flag, delete_flag)';
                const values = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                const params = [school_id, agent_code, agent_name, agent_address, phone_no, email_id, max_amt, allow_collection_days, allow_collection_str_dt, allow_collection_end_dt, account_no, printer_type, print_opt, active_flag, 'N'];
                result = await db_Insert('md_agent', fields, values, null, 0, params);
            }
            
            if (result.suc > 0) {
                // Sync or insert in md_user table for this agent (user_type = 'O')
                const userCheck = await db_Select('id', 'md_user', 'school_id = ? AND user_id = ? AND user_type = "O"', null, [original_school_id, original_agent_code]);
                if (userCheck.suc > 0 && userCheck.msg.length > 0) {
                    // Update existing user mapping
                    const fields = 'school_id=?, user_id=?, device_id=?, active_flag=?';
                    const params = [school_id, agent_code, device_id, active_flag, original_school_id, original_agent_code];
                    await db_Insert('md_user', fields, null, 'school_id = ? AND user_id = ? AND user_type = "O"', 1, params);
                } else {
                    // Create new user record with default password '1234'
                    const hashedPassword = await bcrypt.hash("1234", 10);
                    const fields = '(school_id, user_type, password, device_id, user_id, active_flag, delete_flag)';
                    const values = '(?, ?, ?, ?, ?, ?, ?)';
                    const params = [school_id, 'O', hashedPassword, device_id, agent_code, active_flag, 'N'];
                    await db_Insert('md_user', fields, values, null, 0, params);
                }

                req.flash('success_msg', agent_id > 0 ? 'Agent details updated successfully' : 'Agent registered successfully');
            } else {
                req.flash('error_msg', 'Operation failed: ' + result.msg);
            }
        } catch (err) {
            console.error("Error processing agent manage request:", err);
            req.flash('error_msg', 'Database processing error occurred');
        }
        res.redirect('/admin/agent');
    } else {
        res.status(405).send('Method Not Allowed');
    }
})

// Toggle Agent Status (Disable/Enable)
agentRouter.get('/toggle-status/:id', async (req, res) => {
    const agent_id = req.params.id;
    try {
        const agent_data = await db_Select('school_id, agent_code, active_flag', 'md_agent', 'agent_id=?', null, [agent_id]);
        if (agent_data.suc > 0 && agent_data.msg.length > 0) {
            const new_flag = agent_data.msg[0].active_flag === 'Y' ? 'N' : 'Y';
            const school_id = agent_data.msg[0].school_id;
            const agent_code = agent_data.msg[0].agent_code;
            const result = await db_Insert('md_agent', 'active_flag=?', null, 'agent_id=?', 1, [new_flag, agent_id]);
            if (result.suc > 0) {
                // Keep md_user status in sync
                await db_Insert('md_user', 'active_flag=?', null, 'school_id = ? AND user_id = ? AND user_type = "O"', 1, [new_flag, school_id, agent_code]);
                req.flash('success_msg', 'Agent status updated successfully');
            } else {
                req.flash('error_msg', 'Failed to toggle agent status');
            }
        } else {
            req.flash('error_msg', 'Agent not found');
        }
    } catch (err) {
        console.error("Error toggling agent status:", err);
        req.flash('error_msg', 'Status toggle processing error occurred');
    }
    res.redirect('/admin/agent');
});

module.exports = {agentRouter};