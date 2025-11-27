// 这个脚本用于检查实际运行状态
console.log("=".repeat(60));
console.log("🔍 运行状态检查");
console.log("=".repeat(60));

console.log("\n1. 窗口位置:");
console.log("   window.self === window.top:", window.self === window.top);

console.log("\n2. Tauri API:");
console.log("   window.__TAURI__:", !!window.__TAURI__);
console.log("   window.parent.__TAURI__:", window.self !== window.top ? !!window.parent.__TAURI__ : "N/A");

console.log("\n3. 标签页系统:");
console.log("   window.tauriTabs:", window.tauriTabs);
console.log("   标签栏存在:", !!document.getElementById('tauri-tab-bar'));

console.log("\n4. 缩放:");
console.log("   window.tauriZoom:", window.tauriZoom);
console.log("   document.body.style.zoom:", document.body.style.zoom);

console.log("\n5. 代理:");
console.log("   window.fetch === originalFetch:", window.fetch.toString().includes('proxy'));
console.log("   window.XMLHttpRequest 类型:", window.XMLHttpRequest.name);

console.log("\n6. DOM 结构:");
console.log("   iframe 数量:", document.querySelectorAll('iframe').length);
console.log("   body children:", document.body.children.length);

console.log("=".repeat(60));
