const dashbaordRouter = require('express').Router();
const { db_Select } = require('../../controllers/common_controller');

dashbaordRouter.get('/:type', async (req, res) => {
    let type = req.params.type;
    res.locals.currentPage = 'dashboard';
    
    try {
        if (type === 'super-admin') {
            // Fetch Super-Admin Data
            const schoolsRes = await db_Select('COUNT(school_id) as totalSchools', 'md_school', "delete_flag='N'");
            const totalSchools = schoolsRes.msg[0] ? schoolsRes.msg[0].totalSchools : 0;

            const agentsRes = await db_Select('COUNT(agent_id) as activeAgents', 'md_agent', "active_flag='Y' AND delete_flag='N'");
            const activeAgents = agentsRes.msg[0] ? agentsRes.msg[0].activeAgents : 0;

            const collectedRes = await db_Select(null, null, null, null, [], true, 'SELECT SUM(deposit_amount) as totalCollected FROM td_collection');
            const totalCollected = collectedRes.msg[0] && collectedRes.msg[0].totalCollected ? collectedRes.msg[0].totalCollected : 0;

            const pendingRes = await db_Select(null, null, null, null, [], true, "SELECT COUNT(DISTINCT agent_trans_no) as pendingUploads FROM td_collection WHERE download_flag='N'");
            const pendingUploads = pendingRes.msg[0] ? pendingRes.msg[0].pendingUploads : 0;

            const recentTransRes = await db_Select(null, null, null, null, [], true, 'SELECT c.agent_trans_no, SUM(c.deposit_amount) as deposit_amount, MAX(c.transaction_date) as transaction_date, MAX(c.download_flag) as download_flag, s.school_name, a.agent_name FROM td_collection c JOIN md_school s ON c.school_id = s.school_id JOIN md_agent a ON c.agent_code = a.agent_code AND c.school_id = a.school_id GROUP BY c.agent_trans_no, s.school_name, a.agent_name ORDER BY MAX(c.collected_at) DESC LIMIT 5');
            const recentTransactions = recentTransRes.msg || [];

            // Last 7 days data for chart
            const chartDataRes = await db_Select(null, null, null, null, [], true, 'SELECT transaction_date, SUM(deposit_amount) as amount FROM td_collection WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY transaction_date ORDER BY transaction_date ASC');
            const chartData = chartDataRes.msg || [];

            res.render('pages/dashboard/super-admin-dashboard', { 
                title: 'Super Admin Dashboard',
                totalSchools,
                activeAgents,
                totalCollected,
                pendingUploads,
                recentTransactions,
                chartData: JSON.stringify(chartData)
            });
        } else if (type === 'admin') {
            const school_id = req.session.user && req.session.user.user_data && req.session.user.user_data ? req.session.user.user_data.school_id : 0;
            
            const studentsRes = await db_Select('COUNT(account_dtls_id) as totalStudents', 'td_account_dtls', `school_id='${school_id}'`);
            const totalStudents = studentsRes.msg[0] ? studentsRes.msg[0].totalStudents : 0;

            const agentsRes = await db_Select('COUNT(agent_id) as activeAgents', 'md_agent', `school_id='${school_id}' AND active_flag='Y' AND delete_flag='N'`);
            const activeAgents = agentsRes.msg[0] ? agentsRes.msg[0].activeAgents : 0;

            const collectedRes = await db_Select(null, null, null, null, [], true, `SELECT SUM(deposit_amount) as totalCollected FROM td_collection WHERE school_id='${school_id}'`);
            const totalCollected = collectedRes.msg[0] && collectedRes.msg[0].totalCollected ? collectedRes.msg[0].totalCollected : 0;

            const pendingRes = await db_Select(null, null, null, null, [], true, `SELECT COUNT(DISTINCT agent_trans_no) as pendingUploads FROM td_collection WHERE school_id='${school_id}' AND download_flag='N'`);
            const pendingUploads = pendingRes.msg[0] ? pendingRes.msg[0].pendingUploads : 0;

            const recentTransRes = await db_Select(null, null, null, null, [], true, `SELECT c.agent_trans_no, SUM(c.deposit_amount) as deposit_amount, MAX(c.transaction_date) as transaction_date, MAX(c.download_flag) as download_flag, s.school_name, a.agent_name FROM td_collection c JOIN md_school s ON c.school_id = s.school_id JOIN md_agent a ON c.agent_code = a.agent_code AND c.school_id = a.school_id WHERE c.school_id='${school_id}' GROUP BY c.agent_trans_no, s.school_name, a.agent_name ORDER BY MAX(c.collected_at) DESC LIMIT 5`);
            const recentTransactions = recentTransRes.msg || [];

            // Last 7 days data for chart
            const chartDataRes = await db_Select(null, null, null, null, [], true, `SELECT transaction_date, SUM(deposit_amount) as amount FROM td_collection WHERE school_id='${school_id}' AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY transaction_date ORDER BY transaction_date ASC`);
            const chartData = chartDataRes.msg || [];

            res.render('pages/dashboard/admin-dashboard', { 
                title: 'Admin Dashboard',
                totalStudents,
                activeAgents,
                totalCollected,
                pendingUploads,
                recentTransactions,
                chartData: JSON.stringify(chartData)
            });
        } else {
            res.render('pages/dashboard/admin-dashboard', { title: 'Admin Dashboard' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
})

module.exports = {dashbaordRouter};