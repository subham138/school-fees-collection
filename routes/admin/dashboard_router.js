const dashbaordRouter = require('express').Router();

dashbaordRouter.get('/:type', (req, res) => {
    let type = req.params.type;
    res.locals.currentPage = 'dashboard';
    if (type == 'super-admin') {
        res.render('pages/dashboard/super-admin-dashboard', { title: 'Super Admin Dashboard' });
    } else if (type == 'admin') {
        res.render('pages/dashboard/admin-dashboard', { title: 'Admin Dashboard' });
    } else {
        res.render('pages/ashboard/admin-dashboard', { title: 'Admin Dashboard' });
    }
})

module.exports = {dashbaordRouter};