const { ServiceBusClient } = require('@azure/service-bus');
const { DefaultAzureCredential } = require('@azure/identity');
const logger = require('../utils/logger');

let serviceBusClient = null;
let sender = null;

/**
 * Tạo và tái sử dụng một Service Bus sender.
 * Không tạo sender mới cho mỗi sự kiện.
 */
function getSender() {
  const namespace = process.env.SERVICE_BUS_NAMESPACE;
  const queueName =
    process.env.SERVICE_BUS_QUEUE_NAME || 'game-events';

  if (!namespace) {
    return null;
  }

  if (!serviceBusClient) {
    const credential = new DefaultAzureCredential();

    serviceBusClient = new ServiceBusClient(
      namespace,
      credential
    );

    sender = serviceBusClient.createSender(queueName);
  }

  return sender;
}

/**
 * Gửi một game event vào Azure Service Bus.
 */
async function publishGameEvent(event) {
  if (!event?.eventId) {
    throw new Error('Service Bus eventId is required');
  }

  if (!event?.eventType) {
    throw new Error('Service Bus eventType is required');
  }

  const currentSender = getSender();

  // Backend local vẫn chạy được khi chưa cấu hình Azure.
  if (!currentSender) {
    logger.warn(
      '[ServiceBus] SERVICE_BUS_NAMESPACE is not configured'
    );

    return false;
  }

  await currentSender.sendMessages({
    body: event,
    messageId: event.eventId,
    subject: event.eventType,
    contentType: 'application/json',
    correlationId:
      event.matchId || event.playerId || event.eventId,
    applicationProperties: {
      eventType: event.eventType,
      schemaVersion: event.schemaVersion || 1,
    },
  });

  logger.info('[ServiceBus] Event published', {
    eventId: event.eventId,
    eventType: event.eventType,
  });

  return true;
}

/**
 * Đóng kết nối khi Container App dừng.
 */
async function closeServiceBus() {
  if (sender) {
    await sender.close();
    sender = null;
  }

  if (serviceBusClient) {
    await serviceBusClient.close();
    serviceBusClient = null;
  }
}

module.exports = {
  publishGameEvent,
  closeServiceBus,
};