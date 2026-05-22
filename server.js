require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session & Flash messages
app.use(session({
    secret: process.env.SESSION_SECRET || 'school_collection_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));
app.use(flash());

// Global variables for views
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});

// EJS Setup
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout'); // Set default layout

// Routes
// const adminUploadRoutes = require('./routes/admin');
const { adminIndexRouter } = require('./routes/admin/admin_index_router');
const { apiIndexRouter } = require('./routes/api/api_index_router');

app.use('/', adminIndexRouter);
// app.use('/uploads', adminUploadRoutes);
app.use('/api/v1', apiIndexRouter);

// Error Handling
app.use((req, res, next) => {
    res.status(404).render('pages/404', { title: 'Page Not Found', layout: false });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
