function clearConversation({ transcript, buffers, bufferBytes }) {
  transcript.length = 0;
  buffers.you = [];
  buffers.them = [];
  bufferBytes.you = 0;
  bufferBytes.them = 0;
}

module.exports = { clearConversation };
