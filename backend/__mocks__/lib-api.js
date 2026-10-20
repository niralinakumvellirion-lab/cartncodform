'use strict';
module.exports = {
  apiGet: jest.fn().mockResolvedValue({}),
  apiSend: jest.fn().mockResolvedValue({}),
  BACKEND_URL: 'http://localhost:4000',
};
