/**
 * Linux 特定问题修复模块
 * 
 * 修复的问题：
 * 1. 双击选中整行问题（WebKitGTK 行为差异）
 * 2. a 标签下载问题（WebKitGTK 下载处理）
 */

import { isLinux } from './utils/dom.js';

/**
 * 初始化 Linux 修复
 */
export function initLinuxFixes(log, invoke) {
  // 详细的平台检测日志
  log('🔍 [Linux Debug] 平台检测:');
  log(`   navigator.platform = "${navigator.platform}"`);
  log(`   navigator.userAgent = "${navigator.userAgent}"`);
  log(`   isLinux() = ${isLinux()}`);
  
  if (!isLinux()) {
    log('ℹ️  非 Linux 系统，跳过 Linux 修复');
    return;
  }

  log('🐧 检测到 Linux 系统，应用修复...');

  // 修复1: 双击选中行为
  fixDoubleClickSelection(log);

  // 修复2: input 边框显示问题（轻量版）
  fixInputBorderRendering(log);
  
  // 修复3: 主文档的下载问题
  fixDownloadInDocument(document, log, invoke);

  log('✅ Linux 修复已应用');
}

/**
 * 在 iframe 中应用 Linux 修复
 */
export function applyLinuxFixesToIframe(iframeDoc, log) {
  log('🔍 [Linux Debug] applyLinuxFixesToIframe 被调用');
  log(`🔍 [Linux Debug] isLinux() = ${isLinux()}`);
  log(`🔍 [Linux Debug] iframeDoc = ${iframeDoc ? '存在' : '不存在'}`);
  
  if (!isLinux()) {
    log('ℹ️ [Linux Debug] 非 Linux 系统，跳过 iframe 修复');
    return;
  }
  
  if (!iframeDoc) {
    log('⚠️ [Linux Debug] iframeDoc 为空，跳过');
    return;
  }

  try {
    log('🔧 [Linux Debug] 开始应用 iframe 修复...');
    
    // 获取 invoke 函数（从全局 Tauri API）
    const invoke = window.__TAURI__?.core?.invoke;
    
    // 注入 Linux 修复样式到 iframe
    injectLinuxStyles(iframeDoc, log);

    // 修复双击选中行为
    fixDoubleClickInDocument(iframeDoc, log);

    // 修复 a 标签下载问题
    fixDownloadInDocument(iframeDoc, log, invoke);

    log('✅ iframe Linux 修复已应用');
  } catch (err) {
    log(`⚠️ iframe Linux 修复失败: ${err.message}`);
    log(`⚠️ 错误堆栈: ${err.stack}`);
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
 * 修复 a 标签下载问题
 * Linux WebKitGTK 要求 <a> 元素必须在 DOM 中才能响应 click()
 * 解决方案：拦截 HTMLAnchorElement.prototype.click，临时将元素添加到 DOM，
 * 并使用 dispatchEvent 触发真正的 MouseEvent
 * 对于 iframe 中的下载，使用 fetch + Tauri API 直接保存文件
 */
function fixDownloadInDocument(doc, log, invoke) {
  const docName = doc === document ? '主文档' : 'iframe';
  log(`🔧 [Linux Fix] 开始应用下载修复到 ${docName}...`);
  
  // 获取 iframe 的 window 对象
  const win = doc.defaultView || window;
  
  if (!win) {
    log(`❌ [Linux Fix] ${docName} 的 window 对象不可用`);
    return;
  }
  
  // 标记是否已经应用过修复（防止重复应用）
  if (win.__linuxClickFixApplied) {
    log(`ℹ️ [Linux Fix] ${docName} click 修复已应用，跳过`);
    return;
  }
  win.__linuxClickFixApplied = true;
  
  // 保存原始的 click 方法
  const originalClick = win.HTMLAnchorElement.prototype.click;
  log(`🔧 [Linux Fix] ${docName} 原始 click 方法已保存: ${typeof originalClick}`);
  
  // 重写 click 方法
  win.HTMLAnchorElement.prototype.click = function() {
    const href = this.href || '';
    const download = this.download || '';
    const target = this.target || '';
    const ownerDoc = this.ownerDocument || doc;
    const isInDOM = ownerDoc.body && ownerDoc.body.contains(this);
    
    // 详细日志
    log(`📥 [Linux Fix] <a>.click() 被调用:`);
    log(`   href = "${href.substring(0, 100)}${href.length > 100 ? '...' : ''}"`);
    log(`   download = "${download}"`);
    log(`   target = "${target}"`);
    log(`   isInDOM = ${isInDOM}`);
    log(`   ownerDoc = ${ownerDoc === document ? '主文档' : 'iframe文档'}`);
    
    // 只处理有 href 且不在 DOM 中的 <a> 元素
    if (href && !isInDOM) {
      // 排除 javascript:, mailto:, tel: 等特殊协议
      const isSpecialProtocol = /^(javascript|mailto|tel):/i.test(href);
      log(`   isSpecialProtocol = ${isSpecialProtocol}`);
      
      if (!isSpecialProtocol) {
        log(`📥 [Linux Fix] ⚡ 需要修复！临时添加到 DOM...`);
        
        // 对于 iframe 中的下载，使用更直接的方法
        const isInIframe = ownerDoc !== document;
        
        if (isInIframe) {
          // iframe 中的下载：使用 fetch + Tauri API 直接保存文件
          log(`📥 [Linux Fix] 检测到 iframe 中的下载，使用 fetch + Tauri API...`);
          
          // 检查是否有 Tauri invoke API
          const tauriInvoke = invoke || window.__TAURI__?.core?.invoke;
          
          if (tauriInvoke) {
            // 使用 fetch + Tauri API 保存文件
            log(`📥 [Linux Fix] 开始下载文件...`);
            
            fetch(href, {
              method: 'GET',
              credentials: 'include',
              headers: {
                'Accept': '*/*'
              }
            })
            .then(response => {
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              
              // 提取文件名（优先级：Content-Disposition > download 属性 > URL）
              let filename = download || 'download';
              
              // 从 Content-Disposition 头中提取文件名
              const contentDisposition = response.headers.get('Content-Disposition');
              if (contentDisposition) {
                log(`📥 [Linux Fix] Content-Disposition: ${contentDisposition}`);
                
                // 匹配 filename= 或 filename*= 格式
                const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
                if (filenameMatch) {
                  let extractedFilename = filenameMatch[1];
                  
                  // 移除引号
                  if ((extractedFilename.startsWith('"') && extractedFilename.endsWith('"')) ||
                      (extractedFilename.startsWith("'") && extractedFilename.endsWith("'"))) {
                    extractedFilename = extractedFilename.slice(1, -1);
                  }
                  
                  // 处理 RFC 5987 格式 (filename*=UTF-8''...)
                  if (extractedFilename.startsWith("UTF-8''") || extractedFilename.startsWith("utf-8''")) {
                    extractedFilename = decodeURIComponent(extractedFilename.substring(7));
                  } else {
                    // 尝试解码 URL 编码
                    try {
                      extractedFilename = decodeURIComponent(extractedFilename);
                    } catch (e) {
                      // 如果解码失败，使用原始值
                    }
                  }
                  
                  if (extractedFilename) {
                    filename = extractedFilename;
                    log(`📥 [Linux Fix] 从 Content-Disposition 提取文件名: ${filename}`);
                  }
                }
              }
              
              // 如果还没有文件名，从 URL 中提取
              if (!filename || filename === 'download') {
                const urlPath = href.split('/').pop().split('?')[0];
                if (urlPath) {
                  try {
                    filename = decodeURIComponent(urlPath);
                    log(`📥 [Linux Fix] 从 URL 提取文件名: ${filename}`);
                  } catch (e) {
                    filename = urlPath;
                    log(`📥 [Linux Fix] 从 URL 提取文件名（未解码）: ${filename}`);
                  }
                }
              }
              
              // 获取 Content-Type
              const contentType = response.headers.get('Content-Type') || '';
              log(`📥 [Linux Fix] Content-Type: ${contentType}`);
              
              // 检查文件名是否有有效的扩展名
              const filenameParts = filename.split('.');
              const hasValidExtension = filenameParts.length > 1 && 
                                       filenameParts[filenameParts.length - 1].length > 0 && 
                                       filenameParts[filenameParts.length - 1].length <= 10; // 扩展名通常不超过10个字符
              
              log(`📥 [Linux Fix] 文件名检查: "${filename}", 是否有扩展名: ${hasValidExtension}`);
              
              // 如果文件名没有有效的扩展名，根据 Content-Type 添加
              if (!hasValidExtension && contentType) {
                log(`📥 [Linux Fix] 文件名没有扩展名，根据 Content-Type 添加扩展名...`);
                let ext = '';
                const contentTypeLower = contentType.toLowerCase();
                
                // Excel 文件类型检测（优先级从高到低）
                if (contentTypeLower.includes('vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
                  // 明确的 .xlsx 格式
                  ext = '.xlsx';
                } else if (contentTypeLower === 'application/vnd.ms-excel' || 
                          (contentTypeLower.includes('vnd.ms-excel') && !contentTypeLower.includes('openxml'))) {
                  // application/vnd.ms-excel 可能是 .xls 或 .xlsx
                  // 根据文件大小和常见情况，优先使用 .xlsx（现代格式更常见）
                  // 但也可以根据实际情况调整为 .xls
                  ext = '.xlsx'; // 现代 Excel 文件更常见，使用 .xlsx
                  log(`📥 [Linux Fix] 检测到 application/vnd.ms-excel，使用 .xlsx 扩展名`);
                } else if (contentTypeLower.includes('excel') || contentTypeLower.includes('spreadsheet')) {
                  ext = '.xlsx'; // 默认使用新格式
                } else if (contentTypeLower.includes('csv') || contentTypeLower.includes('text/csv')) {
                  ext = '.csv';
                } else if (contentTypeLower.includes('pdf') || contentTypeLower.includes('application/pdf')) {
                  ext = '.pdf';
                } else if (contentTypeLower.includes('zip') || contentTypeLower.includes('application/zip')) {
                  ext = '.zip';
                } else if (contentTypeLower.includes('rar') || contentTypeLower.includes('application/x-rar')) {
                  ext = '.rar';
                } else if (contentTypeLower.includes('json') || contentTypeLower.includes('application/json')) {
                  ext = '.json';
                } else if (contentTypeLower.includes('xml') || contentTypeLower.includes('application/xml')) {
                  ext = '.xml';
                } else if (contentTypeLower.includes('text/plain')) {
                  ext = '.txt';
                }
                
                if (ext) {
                  // 如果文件名以点结尾，直接替换；否则添加扩展名
                  if (filename.endsWith('.')) {
                    filename = filename.slice(0, -1) + ext;
                  } else {
                    filename = filename + ext;
                  }
                  log(`📥 [Linux Fix] 根据 Content-Type 添加扩展名: ${filename}`);
                }
              }
              
              // 如果还是没有文件名，使用默认名称
              if (!filename || filename === 'download') {
                const contentTypeLower = (contentType || '').toLowerCase();
                let ext = '.bin';
                if (contentTypeLower.includes('vnd.openxmlformats-officedocument.spreadsheetml.sheet') ||
                    contentTypeLower.includes('excel') || contentTypeLower.includes('spreadsheet')) {
                  ext = '.xlsx';
                } else if (contentTypeLower.includes('csv')) {
                  ext = '.csv';
                } else if (contentTypeLower.includes('pdf')) {
                  ext = '.pdf';
                } else if (contentTypeLower.includes('zip')) {
                  ext = '.zip';
                }
                filename = `download${ext}`;
                log(`📥 [Linux Fix] 使用默认文件名: ${filename}`);
              }
              
              log(`📥 [Linux Fix] 最终文件名: ${filename}`);
              
              // 获取文件内容
              return response.arrayBuffer().then(arrayBuffer => {
                return { arrayBuffer, filename };
              });
            })
            .then(({ arrayBuffer, filename }) => {
              log(`📥 [Linux Fix] ✓ 文件已获取，大小: ${arrayBuffer.byteLength} bytes`);
              
              // 转换为 Uint8Array
              const bytes = new Uint8Array(arrayBuffer);
              
              // 调用 Tauri API 保存文件
              return tauriInvoke('save_file_to_downloads', {
                filename: filename,
                data: Array.from(bytes)
              });
            })
            .then(savedPath => {
              log(`📥 [Linux Fix] ✅ 文件已保存到: ${savedPath}`);
            })
            .catch(err => {
              log(`❌ [Linux Fix] 下载失败: ${err.message}`);
              log(`❌ [Linux Fix] 错误详情: ${err.stack || err}`);
              
              // 备用方案：尝试 window.open
              log(`📥 [Linux Fix] 尝试使用 window.open 作为备用...`);
              try {
                win.open(href, target || '_blank');
                log(`📥 [Linux Fix] ✓ window.open 已调用`);
              } catch (openErr) {
                log(`❌ [Linux Fix] window.open 也失败: ${openErr.message}`);
              }
            });
          } else {
            // 没有 Tauri API，使用 window.open
            log(`⚠️ [Linux Fix] Tauri API 不可用，使用 window.open...`);
            try {
              win.open(href, target || '_blank');
              log(`📥 [Linux Fix] ✓ window.open 已调用`);
            } catch (openErr) {
              log(`❌ [Linux Fix] window.open 失败: ${openErr.message}`);
            }
          }
          
          return;
        }
        
        // 主文档中的下载：使用 DOM + click 方式
        const originalStyle = this.style.cssText;
        
        // 临时添加到 DOM（隐藏）
        this.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;width:1px;height:1px;';
        ownerDoc.body.appendChild(this);
        log(`📥 [Linux Fix] ✓ 已添加到 DOM`);
        
        // 等待一帧，确保元素已完全添加到 DOM
        requestAnimationFrame(() => {
          try {
            // 先尝试使用原始的 click 方法（更可靠）
            log(`📥 [Linux Fix] 调用原始 click 方法...`);
            originalClick.call(this);
            log(`📥 [Linux Fix] ✓ 原始 click 方法已调用`);
            
            // 延迟移除（增加延迟时间，确保下载已开始）
            setTimeout(() => {
              if (this.parentNode) {
                // 恢复原始样式（如果有）
                if (originalStyle) {
                  this.style.cssText = originalStyle;
                } else {
                  this.removeAttribute('style');
                }
                this.parentNode.removeChild(this);
                log(`📥 [Linux Fix] ✓ 临时元素已移除`);
              }
            }, 2000); // 增加到 2 秒，确保下载已开始
          } catch (err) {
            log(`❌ [Linux Fix] 调用 click 方法失败: ${err.message}`);
            // 如果失败，尝试使用 window.open 作为最后手段
            if (href && (!target || target === '_self')) {
              log(`📥 [Linux Fix] 尝试使用 window.open 作为备用方案...`);
              try {
                win.open(href, target || '_self');
                log(`📥 [Linux Fix] ✓ window.open 已调用`);
              } catch (openErr) {
                log(`❌ [Linux Fix] window.open 也失败: ${openErr.message}`);
              }
            }
            // 仍然移除元素
            setTimeout(() => {
              if (this.parentNode) {
                this.parentNode.removeChild(this);
                log(`📥 [Linux Fix] ✓ 临时元素已移除（错误恢复）`);
              }
            }, 1000);
          }
        });
        
        return;
      }
    }
    
    // 元素已在 DOM 中或是特殊协议，正常执行
    log(`📥 [Linux Fix] 使用原始 click 方法`);
    originalClick.call(this);
  };

  log(`✅ [Linux Fix] ${docName} <a> 标签 click 修复已启用`);
}

/**
 * 注入 Linux 专用样式
 * 注意：边框问题是由缩放引起的，不需要额外的边框样式修复
 */
function injectLinuxStyles(doc, log) {
  if (!doc.head) return;

  // 检查是否已经注入
  if (doc.getElementById('tauri-linux-fixes-style')) return;

  const style = doc.createElement('style');
  style.id = 'tauri-linux-fixes-style';
  style.textContent = `
    /* ========== Linux 专用修复样式（轻量版） ========== */

    /* 防止亚像素渲染问题导致的边框闪烁 */
    input, textarea, select {
      -webkit-transform: translateZ(0);
      transform: translateZ(0);
    }

    /* 防止双击选中整行 - 限制选择范围 */
    p, div, span, li, td, th, label {
      word-break: break-word;
      overflow-wrap: break-word;
    }
  `;
  doc.head.appendChild(style);
  log('🎨 Linux 轻量修复样式已注入');
}

