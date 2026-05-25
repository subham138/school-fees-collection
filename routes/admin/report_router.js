const reportRouter = require('express').Router();
const { db_Select } = require('../../controllers/common_controller');

reportRouter.get('/', async (req, res) => {
    res.locals.currentPage = 'report';
    const user = req.session.user;

    // Date formatting helper defaults (1st day of current month to today)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const defaultToDate = `${year}-${month}-${day}`;
    const defaultFromDate = `${year}-${month}-01`;

    const activeReport = req.query.report_type || 'agent_summary';
    const fromDate = req.query.from_date || defaultFromDate;
    const toDate = req.query.to_date || defaultToDate;
    const selectedSchool = req.query.school_id || '';
    const selectedAgent = req.query.agent_code || '';
    const selectedStatus = req.query.status || 'ALL';
    const search = req.query.search || '';

    try {
        // 1. Fetch school list (only required for Super-Admin dropdown selection)
        let schools = [];
        if (user.user_data.user_type === 'S') {
            const schoolsRes = await db_Select('school_id, school_name', 'md_school', "delete_flag='N'", 'ORDER BY school_name ASC');
            schools = schoolsRes.msg || [];
        }

        // 2. Fetch agent list
        let agents = [];
        if (user.user_data.user_type === 'S') {
            // Load all active agents across schools for super-admin frontend client-side filtering
            const agentsRes = await db_Select('agent_code, agent_name, school_id', 'md_agent', "delete_flag='N' AND active_flag='Y'", 'ORDER BY agent_name ASC');
            agents = agentsRes.msg || [];
        } else {
            // Load school-specific active agents for regular school admin
            const school_id = user.user_data.school_id;
            const agentsRes = await db_Select('agent_code, agent_name, school_id', 'md_agent', `school_id='${school_id}' AND delete_flag='N' AND active_flag='Y'`, 'ORDER BY agent_name ASC');
            agents = agentsRes.msg || [];
        }

        // 3. Execute report data aggregation query
        let results = [];
        const queryParams = [];

        if (activeReport === 'agent_summary') {
            let sql = `
                SELECT 
                    c.agent_code, 
                    a.agent_name, 
                    c.school_id,
                    s.school_name,
                    COUNT(c.receipt_no) as total_receipts, 
                    SUM(c.deposit_amount) as total_collected,
                    SUM(CASE WHEN c.download_flag = 'Y' THEN c.deposit_amount ELSE 0 END) as total_uploaded,
                    SUM(CASE WHEN c.download_flag = 'N' THEN c.deposit_amount ELSE 0 END) as total_pending
                FROM td_collection c
                JOIN md_agent a ON c.agent_code = a.agent_code AND c.school_id = a.school_id
                JOIN md_school s ON c.school_id = s.school_id
                WHERE c.transaction_date BETWEEN ? AND ?
            `;
            queryParams.push(fromDate, toDate);

            if (user.user_data.user_type === 'S') {
                if (selectedSchool) {
                    sql += ` AND c.school_id = ?`;
                    queryParams.push(selectedSchool);
                }
            } else {
                sql += ` AND c.school_id = ?`;
                queryParams.push(user.user_data.school_id);
            }

            if (selectedAgent) {
                sql += ` AND c.agent_code = ?`;
                queryParams.push(selectedAgent);
            }

            sql += ` GROUP BY c.agent_code, a.agent_name, c.school_id, s.school_name ORDER BY total_collected DESC`;
            const reportRes = await db_Select(null, null, null, null, queryParams, true, sql);
            results = reportRes.msg || [];

        } else if (activeReport === 'detailed_register') {
            let sql = `
                SELECT 
                    c.receipt_no, 
                    c.transaction_date, 
                    c.student_name, 
                    c.guardian_name, 
                    c.deposit_amount, 
                    c.download_flag,
                    a.agent_name,
                    c.agent_code,
                    s.school_name
                FROM td_collection c
                JOIN md_agent a ON c.agent_code = a.agent_code AND c.school_id = a.school_id
                JOIN md_school s ON c.school_id = s.school_id
                WHERE c.transaction_date BETWEEN ? AND ?
            `;
            queryParams.push(fromDate, toDate);

            if (user.user_data.user_type === 'S') {
                if (selectedSchool) {
                    sql += ` AND c.school_id = ?`;
                    queryParams.push(selectedSchool);
                }
            } else {
                sql += ` AND c.school_id = ?`;
                queryParams.push(user.user_data.school_id);
            }

            if (selectedAgent) {
                sql += ` AND c.agent_code = ?`;
                queryParams.push(selectedAgent);
            }

            if (selectedStatus && selectedStatus !== 'ALL') {
                sql += ` AND c.download_flag = ?`;
                queryParams.push(selectedStatus);
            }

            if (search) {
                sql += ` AND (c.student_name LIKE ? OR c.receipt_no LIKE ?)`;
                queryParams.push(`%${search}%`, `%${search}%`);
            }

            sql += ` ORDER BY c.collected_at DESC`;
            const reportRes = await db_Select(null, null, null, null, queryParams, true, sql);
            results = reportRes.msg || [];

        } else if (activeReport === 'class_summary' && user.user_data.user_type !== 'S') {
            const school_id = user.user_data.school_id;

            // Dynamically construct class totals query to optionally filter expectations by agent
            let classTotalsSql = `
                SELECT 
                    COALESCE(class_no, 'Unassigned') as class_name,
                    COUNT(account_dtls_id) as total_students,
                    SUM(depost_amt) as total_expected
                FROM td_account_dtls
                WHERE school_id = ?
            `;
            const classTotalsParams = [school_id];
            if (selectedAgent) {
                classTotalsSql += ` AND agent_code = ?`;
                classTotalsParams.push(selectedAgent);
            }
            classTotalsSql += ` GROUP BY class_no`;

            // Dynamically construct collection totals query
            let collTotalsSql = `
                SELECT 
                    COALESCE(ad.class_no, 'Unassigned') as class_name,
                    SUM(c.deposit_amount) as total_collected
                FROM td_collection c
                JOIN td_account_dtls ad ON c.account_dtls_id = ad.account_dtls_id
                WHERE c.school_id = ? AND c.transaction_date BETWEEN ? AND ?
            `;
            const collTotalsParams = [school_id, fromDate, toDate];
            if (selectedAgent) {
                collTotalsSql += ` AND c.agent_code = ?`;
                collTotalsParams.push(selectedAgent);
            }
            collTotalsSql += ` GROUP BY ad.class_no`;

            const finalSql = `
                SELECT 
                    class_totals.class_name,
                    class_totals.total_students,
                    class_totals.total_expected,
                    COALESCE(coll_totals.total_collected, 0) as total_collected
                FROM (${classTotalsSql}) class_totals
                LEFT JOIN (${collTotalsSql}) coll_totals ON class_totals.class_name = coll_totals.class_name
                ORDER BY class_totals.class_name ASC
            `;

            const finalParams = [...classTotalsParams, ...collTotalsParams];
            const reportRes = await db_Select(null, null, null, null, finalParams, true, finalSql);
            results = reportRes.msg || [];

        } else if (activeReport === 'school_summary' && user.user_data.user_type === 'S') {
            let activeAgentsFilter = '';
            let accountsFilter = '';
            let collectionsFilter = '';
            const activeAgentsParams = [];
            const accountsParams = [];
            const collectionsParams = [fromDate, toDate];

            if (selectedSchool) {
                activeAgentsFilter = ' AND school_id = ?';
                activeAgentsParams.push(selectedSchool);
                accountsFilter = ' WHERE school_id = ?';
                accountsParams.push(selectedSchool);
                collectionsFilter = ' AND school_id = ?';
                collectionsParams.push(selectedSchool);
            }

            const sql = `
                SELECT 
                    s.school_id,
                    s.school_name,
                    s.school_address,
                    s.contact_person,
                    COALESCE(agents.active_agents, 0) as active_agents,
                    COALESCE(accounts.total_students, 0) as total_students,
                    COALESCE(accounts.total_expected, 0) as total_expected,
                    COALESCE(collections.total_collected, 0) as total_collected
                FROM md_school s
                LEFT JOIN (
                    SELECT school_id, COUNT(agent_id) as active_agents 
                    FROM md_agent 
                    WHERE delete_flag = 'N' AND active_flag = 'Y' ${activeAgentsFilter}
                    GROUP BY school_id
                ) agents ON s.school_id = agents.school_id
                LEFT JOIN (
                    SELECT school_id, COUNT(account_dtls_id) as total_students, SUM(depost_amt) as total_expected 
                    FROM td_account_dtls ${accountsFilter}
                    GROUP BY school_id
                ) accounts ON s.school_id = accounts.school_id
                LEFT JOIN (
                    SELECT school_id, SUM(deposit_amount) as total_collected 
                    FROM td_collection 
                    WHERE transaction_date BETWEEN ? AND ? ${collectionsFilter}
                    GROUP BY school_id
                ) collections ON s.school_id = collections.school_id
                WHERE s.delete_flag = 'N'
                  ${selectedSchool ? ' AND s.school_id = ?' : ''}
                ORDER BY total_collected DESC
            `;

            const finalParams = [
                ...activeAgentsParams,
                ...accountsParams,
                ...collectionsParams,
                ...(selectedSchool ? [selectedSchool] : [])
            ];

            const reportRes = await db_Select(null, null, null, null, finalParams, true, sql);
            results = reportRes.msg || [];
        }

        // Render index report dashboard page with results and settings passed
        res.render('pages/reports/reports_index', {
            title: 'Reports Module',
            user,
            schools,
            agents,
            results,
            activeReport,
            fromDate,
            toDate,
            selectedSchool,
            selectedAgent,
            selectedStatus,
            search
        });

    } catch (error) {
        console.error("Reports Query Error:", error);
        res.status(500).send("Internal Server Reporting Error");
    }
});

module.exports = { reportRouter };