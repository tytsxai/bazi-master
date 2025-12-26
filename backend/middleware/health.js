export const healthCheckHandler = (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'bazi-master-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};
