// Gemini Chat Navigator - Popup Script

document.addEventListener('DOMContentLoaded', function() {
  // 获取元素
  const questionCountEl = document.getElementById('question-count');
  const sessionTimeEl = document.getElementById('session-time');
  const openGeminiBtn = document.getElementById('open-gemini');
  const clearDataBtn = document.getElementById('clear-data');

  // 从 storage 获取数据
  function loadData() {
    chrome.storage.local.get(['questionCount', 'sessionStart'], function(result) {
      if (result.questionCount !== undefined) {
        questionCountEl.textContent = result.questionCount;
      }

      if (result.sessionStart) {
        const elapsed = Math.floor((Date.now() - result.sessionStart) / 60000);
        if (elapsed < 60) {
          sessionTimeEl.textContent = elapsed + '分钟';
        } else {
          const hours = Math.floor(elapsed / 60);
          const mins = elapsed % 60;
          sessionTimeEl.textContent = hours + '时' + mins + '分';
        }
      }
    });
  }

  // 打开 Gemini
  openGeminiBtn.addEventListener('click', function() {
    chrome.tabs.create({ url: 'https://gemini.google.com/' });
  });

  // 清除数据
  clearDataBtn.addEventListener('click', function() {
    if (confirm('确定要清除所有数据吗？')) {
      chrome.storage.local.clear(function() {
        questionCountEl.textContent = '0';
        sessionTimeEl.textContent = '-';
      });
    }
  });

  // 初始加载
  loadData();

  // 定时更新
  setInterval(loadData, 30000);
});
