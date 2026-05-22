const apiIndexRouter = require('express').Router();
const { verifyToken } = require('../../middleware/jwtAuth');

const { agentAuthRouter } = require('./agent_auth_router');
const { collectionRouter } = require('./collection_router');
const { dashboardRouter } = require('./dashboard_router');

apiIndexRouter.use('/agent', agentAuthRouter);
// Protect the following routes
apiIndexRouter.use(verifyToken);
apiIndexRouter.use('/collection', collectionRouter);
apiIndexRouter.use('/dashboard', dashboardRouter);

module.exports = { apiIndexRouter };