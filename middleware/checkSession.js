const checkSession = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

const checkSessionForLogin = (req, res, next) => {
    if (req.session.user) {
        res.redirect(req.session.user.user_type == 'A' ? '/dashboard/super-admin' : '/dashboard/admin');
    } else {
        next();
    }
}

module.exports = { checkSession, checkSessionForLogin };