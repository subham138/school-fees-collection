const adminIndexRouter = require('express').Router();
const { checkSession, checkSessionForLogin } = require('../../middleware/checkSession');

adminIndexRouter.use('/login', checkSessionForLogin, require('./login_router').loginRouter);
adminIndexRouter.use('/dashboard', checkSession, require('./dashboard_router').dashbaordRouter);
adminIndexRouter.use('/admin/school', checkSession, require('./school_router').schoolRouter);
adminIndexRouter.use('/admin/agent', checkSession, require('./agent_router').agentRouter);
adminIndexRouter.use('/admin/report', checkSession, require('./report_router').reportRouter);
adminIndexRouter.use('/admin/upload_download', checkSession, require('./upload_download_router').upDwRouter);

adminIndexRouter.get('/', (req, res) => {
    res.redirect('/login');
})

adminIndexRouter.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
})

module.exports = {adminIndexRouter};