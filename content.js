// Gemini Chat Navigator - Content Script
// 为 Gemini 对话生成浮动目录导航

(function() {
  'use strict';

  // ==================== 配置 ====================
  const CONFIG = {
    PANEL_WIDTH_COLLAPSED: 28,      // 收缩状态宽度
    PANEL_WIDTH_EXPANDED: 220,      // 展开状态宽度
    PREVIEW_LENGTH: 35,             // 问题预览长度
    HIGHLIGHT_DURATION: 2000,       // 高亮持续时间(ms)
    DEBOUNCE_DELAY: 150,            // 防抖延迟
    DOT_SIZE: 8,                    // 小圆点大小
    DEBUG: true,                    // 调试模式
  };

  // 调试日志
  function log(...args) {
    if (CONFIG.DEBUG) {
      console.log('[GCN]', ...args);
    }
  }

  // ==================== 状态管理 ====================
  let questions = [];                // 存储所有问题
  let currentHighlightId = null;     // 当前高亮的问题ID
  let isPanelExpanded = false;       // 面板是否展开
  let searchQuery = '';              // 搜索关键词
  let questionIdMap = new Map();     // ID 到问题的映射

  // ==================== DOM 元素 ====================
  let panel = null;
  let questionList = null;
  let searchInput = null;
  let questionCount = null;

  // ==================== 工具函数 ====================

  // 生成唯一ID
  function generateId() {
    return 'gcn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // 防抖函数
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // 截断文本
  function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  // 格式化时间戳
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // HTML 转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== 问题检测 ====================

  // 检测用户消息 - Gemini 网页版特定选择器
  // 用户消息通常有特定的类名或属性
  function findUserMessages() {
    const messages = [];
    const seenElements = new Set();

    // Gemini 网页版的用户消息选择器
    // 优先使用最精确的选择器
    const selectors = [
      // 主要选择器 - 用户查询块（最精确）
      'user-query',
      '.user-query-container',
      '[data-test-id="user-query"]',
    ];

    // 尝试每个选择器，找到第一个有效的
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          log(`Found ${elements.length} elements with selector: ${selector}`);
          elements.forEach(el => {
            // 检查是否已经处理过，或者是否嵌套在已处理的元素中
            if (!el.dataset.gcnId && !el.dataset.gcnProcessed) {
              // 检查是否嵌套在另一个用户消息中
              const parentMessage = el.closest('[data-gcn-processed="true"]');
              if (!parentMessage) {
                messages.push(el);
                seenElements.add(el);
              }
            }
          });
          if (messages.length > 0) break; // 找到就停止尝试其他选择器
        }
      } catch (e) {
        // 选择器可能无效，继续尝试下一个
      }
    }

    // 如果还是没有找到，尝试更智能的方法
    if (messages.length === 0) {
      log('Using smart detection');
      const smartMessages = findUserMessagesSmart();
      smartMessages.forEach(el => {
        if (!seenElements.has(el)) {
          messages.push(el);
        }
      });
    }

    log(`Total user messages found: ${messages.length}`);
    return messages;
  }

  // 智能查找用户消息
  function findUserMessagesSmart() {
    const messages = [];
    const seen = new Set();

    // 查找对话容器
    const chatContainer = document.querySelector('main, [role="log"], chat-window, .chat-container');
    if (!chatContainer) {
      log('Chat container not found');
      return messages;
    }

    // 查找所有消息块
    const allBlocks = chatContainer.querySelectorAll('*');

    allBlocks.forEach(el => {
      // 跳过已处理的
      if (el.dataset.gcnId || el.dataset.gcnProcessed) return;

      // 跳过太小的元素
      const rect = el.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 20) return;

      // 检查是否是用户消息
      if (isLikelyUserMessage(el)) {
        // 确保不是嵌套在另一个用户消息中
        const parentUserMessage = el.closest('[data-gcn-id]');
        if (!parentUserMessage && !seen.has(el)) {
          messages.push(el);
          seen.add(el);
        }
      }
    });

    log(`Smart detection found ${messages.length} messages`);
    return messages;
  }

  // 判断元素是否可能是用户消息
  function isLikelyUserMessage(element) {
    // 检查标签名
    const tagName = element.tagName.toLowerCase();

    // 排除一些明显不是消息的元素
    if (['script', 'style', 'meta', 'link', 'head', 'html', 'body'].includes(tagName)) {
      return false;
    }

    // Gemini 特定：user-query 标签
    if (tagName === 'user-query') {
      return true;
    }

    // 检查是否有用户消息的特征
    // 1. 检查 data 属性
    if (element.dataset.user === 'true' ||
        element.dataset.sender === 'user' ||
        element.dataset.role === 'user') {
      return true;
    }

    // 2. 检查类名
    const className = element.className || '';
    if (typeof className === 'string') {
      const userClassPatterns = [
        'user-query', 'user-message', 'user-input',
        'human-message', 'question', 'prompt'
      ];
      for (const pattern of userClassPatterns) {
        if (className.toLowerCase().includes(pattern)) {
          return true;
        }
      }

      // 排除 AI 回复相关的类
      const aiClassPatterns = [
        'model-response', 'ai-response', 'assistant',
        'bot-message', 'gemini-response', 'response-container'
      ];
      for (const pattern of aiClassPatterns) {
        if (className.toLowerCase().includes(pattern)) {
          return false;
        }
      }
    }

    // 3. 检查是否包含用户头像或图标（通常用户消息会有特定的头像）
    const hasUserAvatar = element.querySelector('[data-avatar="user"], .user-avatar, .avatar-user');
    if (hasUserAvatar) return true;

    // 4. 检查是否在 model-response 容器内
    if (element.closest('.model-response, .ai-response, [data-role="assistant"]')) {
      return false;
    }

    return false;
  }

  // 从消息元素提取文本
  function extractMessageText(element) {
    // 尝试找到文本内容区域
    const textSelectors = [
      '.query-text', '.message-text', '.content',
      'p', 'span', 'div'
    ];

    // 首先尝试查找特定的文本容器
    for (const selector of textSelectors) {
      const textEls = element.querySelectorAll(selector);
      for (const textEl of textEls) {
        let text = textEl.textContent.trim();
        // 清理 "You said" 等前缀
        text = cleanMessageText(text);
        // 跳过太短的文本（可能是图标或按钮文字）
        if (text && text.length > 3) {
          return text;
        }
      }
    }

    // 直接获取元素的文本
    let text = element.textContent.trim();
    text = cleanMessageText(text);
    return text.replace(/\s+/g, ' ').trim();
  }

  // 清理消息文本
  function cleanMessageText(text) {
    // 移除常见的标签前缀
    const prefixesToRemove = [
      'You said:',
      'You said',
      'User:',
      '用户:',
      '提问:',
    ];

    let cleaned = text.replace(/\s+/g, ' ').trim();
    for (const prefix of prefixesToRemove) {
      if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
        cleaned = cleaned.substring(prefix.length).trim();
      }
    }

    return cleaned;
  }

  // 处理新检测到的用户消息
  function processUserMessage(element) {
    const text = extractMessageText(element);
    log('processUserMessage, text:', text);

    if (!text || text.length < 2) {
      log('Text too short, skipping');
      return null; // 忽略空消息
    }

    const id = generateId();
    element.dataset.gcnId = id;
    log('Assigned id:', id, 'to element:', element);

    const question = {
      id,
      text,
      preview: truncateText(text, CONFIG.PREVIEW_LENGTH),
      timestamp: Date.now(),
      elementRef: null, // 不直接存储元素引用，改为存储选择器
      selector: generateSelector(element)
    };

    questions.push(question);
    questionIdMap.set(id, question);
    log('Added question, total:', questions.length);

    return question;
  }

  // 生成元素选择器
  function generateSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }

    // 使用 data 属性
    if (element.dataset.gcnId) {
      return `[data-gcn-id="${element.dataset.gcnId}"]`;
    }

    return null;
  }

  // 通过 ID 查找元素
  function findElementById(id) {
    log('findElementById called with id:', id);
    const question = questionIdMap.get(id);
    log('Question from map:', question);

    if (!question) {
      log('Question not found in map');
      return null;
    }

    // 首先尝试通过 data 属性查找
    let element = document.querySelector(`[data-gcn-id="${id}"]`);
    log('Element found by data-gcn-id:', element);

    // 如果找不到，尝试通过选择器查找
    if (!element && question.selector) {
      element = document.querySelector(question.selector);
      log('Element found by selector:', element);
    }

    return element;
  }

  // ==================== 目录面板 UI ====================

  // 创建目录面板
  function createPanel() {
    panel = document.createElement('div');
    panel.id = 'gcn-panel';
    panel.className = 'gcn-panel';

    panel.innerHTML = `
      <div class="gcn-dots-container" id="gcn-dots"></div>
      <div class="gcn-panel-content">
        <div class="gcn-header">
          <span class="gcn-title">目录</span>
          <span class="gcn-count" id="gcn-count">0</span>
        </div>
        <div class="gcn-search">
          <input type="text" id="gcn-search" placeholder="搜索..." />
        </div>
        <div class="gcn-list" id="gcn-list"></div>
      </div>
    `;

    document.body.appendChild(panel);

    // 获取元素引用
    questionList = document.getElementById('gcn-list');
    searchInput = document.getElementById('gcn-search');
    questionCount = document.getElementById('gcn-count');

    // 绑定事件
    bindPanelEvents();
  }

  // 绑定面板事件
  function bindPanelEvents() {
    // 鼠标悬停展开/收缩
    panel.addEventListener('mouseenter', () => {
      expandPanel();
    });

    panel.addEventListener('mouseleave', () => {
      collapsePanel();
    });

    // 搜索输入
    searchInput.addEventListener('input', debounce((e) => {
      searchQuery = e.target.value.toLowerCase();
      renderQuestionList();
    }, CONFIG.DEBOUNCE_DELAY));

    // 阻止面板内的点击事件冒泡
    panel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // 点击标题重新扫描
    const header = panel.querySelector('.gcn-header');
    if (header) {
      header.style.cursor = 'pointer';
      header.title = '点击重新扫描';
      header.addEventListener('click', () => {
        rescanMessages();
      });
    }

    // 滚动监听
    const scrollContainer = findScrollContainer();
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', debounce(() => {
        updateCurrentHighlight();
      }, CONFIG.DEBOUNCE_DELAY));
    } else {
      window.addEventListener('scroll', debounce(() => {
        updateCurrentHighlight();
      }, CONFIG.DEBOUNCE_DELAY));
    }
  }

  // 查找滚动容器
  function findScrollContainer() {
    // Gemini 可能在特定容器内滚动
    // 优先查找有 overflow-y: auto 或 scroll 的容器
    const selectors = [
      'main',
      '.chat-container',
      '[role="log"]',
      'chat-window',
      '.conversation',
      '.conversation-container',
      '[data-test-id="conversation"]'
    ];

    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (container) {
        const style = window.getComputedStyle(container);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') &&
            container.scrollHeight > container.clientHeight) {
          log('Found scroll container:', selector);
          return container;
        }
      }
    }

    // 如果没找到，查找任何可滚动的父元素
    const allContainers = document.querySelectorAll('*');
    for (const container of allContainers) {
      const style = window.getComputedStyle(container);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          container.scrollHeight > container.clientHeight &&
          container.clientHeight > 300) { // 确保是主要滚动区域
        log('Found fallback scroll container');
        return container;
      }
    }

    return null;
  }

  // 展开面板
  function expandPanel() {
    if (isPanelExpanded) return;
    isPanelExpanded = true;
    panel.classList.add('gcn-expanded');

    // 更新当前可见问题的高亮
    updateCurrentHighlight();
  }

  // 收缩面板
  function collapsePanel() {
    if (!isPanelExpanded) return;
    isPanelExpanded = false;
    panel.classList.remove('gcn-expanded');
  }

  // 渲染小圆点（收缩状态）
  function renderDots() {
    const dotsContainer = document.getElementById('gcn-dots');
    if (!dotsContainer) return;

    dotsContainer.innerHTML = questions.map((q, index) => `
      <div class="gcn-dot" data-id="${q.id}" title="${escapeHtml(q.preview)}"></div>
    `).join('');

    // 绑定点击事件
    dotsContainer.querySelectorAll('.gcn-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = dot.dataset.id;
        scrollToQuestion(id);
      });
    });
  }

  // 渲染问题列表
  function renderQuestionList() {
    if (!questionList) return;

    // 过滤问题
    const filteredQuestions = questions.filter(q => {
      if (!searchQuery) return true;
      return q.text.toLowerCase().includes(searchQuery);
    });

    // 更新计数
    questionCount.textContent = filteredQuestions.length;

    // 生成列表 HTML - 简洁的样式
    questionList.innerHTML = filteredQuestions.map((q, index) => `
      <div class="gcn-item" data-id="${q.id}">
        <div class="gcn-item-dot"></div>
        <div class="gcn-item-content">
          <div class="gcn-item-text">${escapeHtml(q.preview)}</div>
        </div>
      </div>
    `).join('');

    // 绑定点击事件
    questionList.querySelectorAll('.gcn-item').forEach(item => {
      item.addEventListener('click', (e) => {
        log('Item clicked, dataset:', item.dataset);
        const id = item.dataset.id;
        log('Click id:', id);
        e.stopPropagation();
        scrollToQuestion(id);
      });
    });

    // 同时更新小圆点
    renderDots();

    // 更新高亮
    updateCurrentHighlight();
  }

  // ==================== 跳转和高亮 ====================

  // 滚动到指定问题
  function scrollToQuestion(id) {
    log('scrollToQuestion called with id:', id);
    const element = findElementById(id);
    log('Found element:', element);

    if (!element) {
      log('Element not found for id:', id);
      log('Current questions:', questions);
      log('questionIdMap:', questionIdMap);

      // 尝试重新查找所有消息
      rescanMessages();
      const retryElement = findElementById(id);
      if (retryElement) {
        scrollToElement(retryElement, id);
      } else {
        log('Still cannot find element after rescan');
      }
      return;
    }

    scrollToElement(element, id);
  }

  // 执行滚动
  function scrollToElement(element, id) {
    log('scrollToElement called');
    log('Element:', element);
    log('Element rect:', element.getBoundingClientRect());

    // 直接使用 scrollIntoView，这是最可靠的方法
    try {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      log('scrollIntoView called successfully');
    } catch (e) {
      log('scrollIntoView error:', e);
    }

    // 添加高亮效果
    highlightElement(element);
    highlightDirectoryItem(id);

    // 收缩面板
    setTimeout(() => {
      collapsePanel();
    }, 300);
  }

  // 重新扫描消息
  function rescanMessages() {
    log('Rescanning messages...');
    questions = [];
    questionIdMap.clear();
    scanExistingMessages();
  }

  // 高亮元素
  function highlightElement(element) {
    // 移除之前的高亮
    document.querySelectorAll('.gcn-highlight').forEach(el => {
      el.classList.remove('gcn-highlight');
    });

    // 添加高亮类
    element.classList.add('gcn-highlight');

    // 定时移除高亮
    setTimeout(() => {
      element.classList.remove('gcn-highlight');
    }, CONFIG.HIGHLIGHT_DURATION);
  }

  // 高亮目录项
  function highlightDirectoryItem(id) {
    // 移除之前的高亮
    if (questionList) {
      questionList.querySelectorAll('.gcn-item-active').forEach(el => {
        el.classList.remove('gcn-item-active');
      });
    }

    const dotsContainer = document.getElementById('gcn-dots');
    if (dotsContainer) {
      dotsContainer.querySelectorAll('.gcn-dot-active').forEach(el => {
        el.classList.remove('gcn-dot-active');
      });
    }

    // 添加高亮
    if (questionList) {
      const item = questionList.querySelector(`[data-id="${id}"]`);
      if (item) {
        item.classList.add('gcn-item-active');
      }
    }

    if (dotsContainer) {
      const dot = dotsContainer.querySelector(`[data-id="${id}"]`);
      if (dot) {
        dot.classList.add('gcn-dot-active');
      }
    }

    currentHighlightId = id;
  }

  // 更新当前可见问题的高亮
  function updateCurrentHighlight() {
    if (!isPanelExpanded && !panel.matches(':hover')) return;

    let currentQuestion = null;
    let minDistance = Infinity;

    questions.forEach(q => {
      const element = findElementById(q.id);
      if (!element) return;

      const rect = element.getBoundingClientRect();

      // 检查是否在视口内
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        const viewportCenter = window.innerHeight / 2;
        const elementCenter = rect.top + rect.height / 2;
        const distance = Math.abs(elementCenter - viewportCenter);

        if (distance < minDistance) {
          minDistance = distance;
          currentQuestion = q;
        }
      }
    });

    // 更新高亮
    if (currentQuestion && currentQuestion.id !== currentHighlightId) {
      highlightDirectoryItem(currentQuestion.id);
    }
  }

  // ==================== 监听和初始化 ====================

  // 扫描现有消息
  function scanExistingMessages() {
    const messages = findUserMessages();
    messages.forEach(el => {
      if (!el.dataset.gcnProcessed) {
        el.dataset.gcnProcessed = 'true';
        processUserMessage(el);
      }
    });

    if (messages.length > 0) {
      renderQuestionList();
    }
  }

  // 设置 DOM 监听器
  function setupMutationObserver() {
    const observer = new MutationObserver(debounce((mutations) => {
      let hasNewMessages = false;

      // 只检查新添加的节点
      const newElements = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查节点本身
            if (!node.dataset?.gcnProcessed && !node.dataset?.gcnId) {
              newElements.push(node);
            }
            // 检查子节点
            node.querySelectorAll?.('[data-gcn-processed]:not([data-gcn-processed])').forEach(el => {
              if (!el.dataset.gcnProcessed && !el.dataset.gcnId) {
                newElements.push(el);
              }
            });
          }
        });
      });

      // 对新元素检查是否是用户消息
      newElements.forEach(el => {
        if (isLikelyUserMessage(el)) {
          // 确保不是嵌套在已处理的消息中
          const parentProcessed = el.closest('[data-gcn-processed="true"]');
          if (!parentProcessed && !el.dataset.gcnProcessed) {
            el.dataset.gcnProcessed = 'true';
            const question = processUserMessage(el);
            if (question) {
              hasNewMessages = true;
            }
          }
        }
      });

      // 如果没有通过新元素找到，尝试完整扫描
      if (!hasNewMessages && newElements.length > 0) {
        const messages = findUserMessages();
        messages.forEach(el => {
          if (!el.dataset.gcnProcessed) {
            el.dataset.gcnProcessed = 'true';
            const question = processUserMessage(el);
            if (question) {
              hasNewMessages = true;
            }
          }
        });
      }

      if (hasNewMessages) {
        renderQuestionList();
      }
    }, CONFIG.DEBOUNCE_DELAY));

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 初始化
  function init() {
    // 等待页面加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initializeExtension, 1500);
      });
    } else {
      setTimeout(initializeExtension, 1500);
    }
  }

  function initializeExtension() {
    // 检查是否在 Gemini 页面
    if (!window.location.hostname.includes('gemini.google.com')) {
      return;
    }

    // 创建面板
    createPanel();

    // 扫描现有消息
    scanExistingMessages();

    // 设置监听器
    setupMutationObserver();

    console.log('Gemini Chat Navigator initialized');
    log('Questions found:', questions.length);
  }

  // 启动
  init();
})();
