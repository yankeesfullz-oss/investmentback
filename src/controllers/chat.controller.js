const chatService = require('../services/chat.service');

async function listMessages(req, res, next) {
  try {
    const messages = await chatService.listMessages(req.user.id);
    return res.status(200).json(messages);
  } catch (error) {
    return next(error);
  }
}

async function listAdminMessages(req, res, next) {
  try {
    const messages = await chatService.listAdminMessages();
    return res.status(200).json(messages);
  } catch (error) {
    return next(error);
  }
}

async function listChatUsers(req, res, next) {
  try {
    const users = await chatService.listChatUsers();
    return res.status(200).json(users);
  } catch (error) {
    return next(error);
  }
}

async function listAdminUserMessages(req, res, next) {
  try {
    const messages = await chatService.listAdminUserMessages(req.params.userId);
    return res.status(200).json(messages);
  } catch (error) {
    return next(error);
  }
}

async function createMessage(req, res, next) {
  try {
    const response = await chatService.createMessage({
      userId: req.user.id,
      content: req.body?.message,
      screenshots: Array.isArray(req.files) ? req.files : [],
      sessionId: req.body?.sessionId,
    });

    return res.status(201).json(response);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listMessages,
  listAdminMessages,
  listChatUsers,
  listAdminUserMessages,
  createMessage,
};