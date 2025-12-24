/**
 * Linux 特定问题修复模块
 * 
 * 修复的问题：
 * 1. 双击选中整行问题（WebKitGTK 行为差异）
 * 2. input 边框显示不完整（亚像素渲染问题）
 * 3. 颜色/对比度优化
 */

import { isLinux } from './utils/dom.js';

/**
 * 初始化 Linux 修复
 */
export function initLinuxFixes(log) {
  if (!isLinux()) {
    log('ℹ️  非 Linux 系统，跳过 Linux 修复');
    return;
  }

  log('🐧 检测到 Linux 系统，应用修复...');

  // 修复1: 双击选中行为
  fixDoubleClickSelection(log);

  // 修复2: input 边框显示问题
  fixInputBorderRendering(log);

  log('✅ Linux 修复已应用');
}

/**
 * 在 iframe 中应用 Linux 修复
 */
export function applyLinuxFixesToIframe(iframeDoc, log) {
  if (!isLinux() || !iframeDoc) return;

  try {
    // 注入 Linux 修复样式到 iframe
    injectLinuxStyles(iframeDoc, log);

    // 修复双击选中行为
    fixDoubleClickInDocument(iframeDoc, log);

    log('✅ iframe Linux 修复已应用');
  } catch (err) {
    log(`⚠️  iframe Linux 修复失败: ${err.message}`);
  }
}

/**
 * 修复1: 双击选中行为
 * Linux WebKitGTK 双击会选中更多内容（类似三击选中整行）
 */
function fixDoubleClickSelection(log) {
  // 在主文档中应用修复
  fixDoubleClickInDocument(document, log);
}

function fixDoubleClickInDocument(doc, log) {
  doc.addEventListener('dblclick', (e) => {
    // 只处理文本内容，不处理输入框
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    // 获取选中内容
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const selectedText = selection.toString();
    
    // 如果选中的文本包含换行符或超过50个字符，说明选中了整行/多行
    // 这是 Linux WebKitGTK 的异常行为
    if (selectedText.includes('\n') || selectedText.length > 50) {
      log(`🔧 检测到 Linux 双击选中过多: "${selectedText.substring(0, 30)}..."`);
      
      // 尝试智能选择单词
      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      
      if (textNode.nodeType === Node.TEXT_NODE) {
        const text = textNode.textContent;
        const clickOffset = range.startOffset;
        
        // 找到单词边界
        const wordBoundary = findWordBoundary(text, clickOffset);
        if (wordBoundary) {
          // 重新选择单词
          range.setStart(textNode, wordBoundary.start);
          range.setEnd(textNode, wordBoundary.end);
          selection.removeAllRanges();
          selection.addRange(range);
          log(`🔧 已修正选中: "${text.substring(wordBoundary.start, wordBoundary.end)}"`);
        }
      }
    }
  }, true);
}

/**
 * 找到单词边界
 */
function findWordBoundary(text, offset) {
  if (!text || offset < 0 || offset > text.length) return null;

  // 单词字符：字母、数字、下划线、中文字符
  const isWordChar = (char) => /[\w\u4e00-\u9fa5]/.test(char);

  let start = offset;
  let end = offset;

  // 向前查找单词开始
  while (start > 0 && isWordChar(text[start - 1])) {
    start--;
  }

  // 向后查找单词结束
  while (end < text.length && isWordChar(text[end])) {
    end++;
  }

  // 如果找到了有效的单词
  if (start < end) {
    return { start, end };
  }

  return null;
}

/**
 * 修复2: input 边框显示问题
 * Linux WebKitGTK 在某些缩放比例下 1px 边框可能显示不完整
 */
function fixInputBorderRendering(log) {
  injectLinuxStyles(document, log);
}

/**
 * 注入 Linux 专用样式
 */
function injectLinuxStyles(doc, log) {
  if (!doc.head) return;

  // 检查是否已经注入
  if (doc.getElementById('tauri-linux-fixes-style')) return;

  const style = doc.createElement('style');
  style.id = 'tauri-linux-fixes-style';
  style.textContent = `
    /* ========== Linux 专用修复样式 ========== */

    /* 修复 input 边框显示不完整 - 使用 box-shadow 代替 border */
    input, textarea, select {
      /* 确保边框完整显示 */
      border-width: 1px !important;
      border-style: solid !important;
      /* 使用 box-shadow 增强边框可见性 */
      box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.1), inset 0 0 0 0.5px rgba(0, 0, 0, 0.05) !important;
      /* 防止亚像素渲染问题 */
      -webkit-transform: translateZ(0);
      transform: translateZ(0);
    }

    /* 增强聚焦状态边框 */
    input:focus, textarea:focus, select:focus {
      outline: none !important;
      box-shadow: 0 0 0 1px #1890ff, 0 0 0 3px rgba(24, 144, 255, 0.2) !important;
    }

    /* 修复 Ant Design / Element UI 等框架的输入框 */
    .ant-input, .ant-select-selector, .el-input__inner, .el-textarea__inner {
      box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.15) !important;
    }

    .ant-input:focus, .ant-input-focused,
    .ant-select-focused .ant-select-selector,
    .el-input__inner:focus, .el-textarea__inner:focus {
      box-shadow: 0 0 0 1px #1890ff, 0 0 0 3px rgba(24, 144, 255, 0.2) !important;
    }

    /* 修复表格单元格边框 */
    table, th, td {
      border-collapse: separate !important;
      border-spacing: 0 !important;
    }

    th, td {
      /* 使用更粗的边框确保可见 */
      border-width: 1px !important;
    }

    /* 增强文本选择的对比度 */
    ::selection {
      background: #1890ff !important;
      color: #fff !important;
    }

    ::-moz-selection {
      background: #1890ff !important;
      color: #fff !important;
    }

    /* 防止双击选中整行 - 限制选择范围 */
    p, div, span, li, td, th, label {
      /* 优化单词选择边界 */
      word-break: break-word;
      overflow-wrap: break-word;
    }

    /* 修复滚动条样式（增强对比度）*/
    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    ::-webkit-scrollbar-track {
      background: #f0f0f0;
    }

    ::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 5px;
      border: 2px solid #f0f0f0;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: #666;
    }
  `;
  doc.head.appendChild(style);
  log('🎨 Linux 修复样式已注入');
}

