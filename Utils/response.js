const successResponse = (res, message, data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

const errorResponse = (res, message, error = null, statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error
  });
};

module.exports = { successResponse, errorResponse };