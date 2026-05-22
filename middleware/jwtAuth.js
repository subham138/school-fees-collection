const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ suc: 0, msg: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'school_collection_jwt_secret_2024');
        req.user = decoded; // Contains { device_id, agent_code, school_id }
        next();
    } catch (err) {
        return res.status(403).json({ suc: 0, msg: 'Invalid or expired token.' });
    }
};

module.exports = { verifyToken };
