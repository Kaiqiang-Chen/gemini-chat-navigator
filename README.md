# Gemini Chat Navigator

一个 Chrome 浏览器扩展，为 Gemini 对话生成浮动目录导航。

## 功能

- 自动提取 Gemini 对话中的用户问题
- 生成浮动的目录面板，显示在页面右侧
- 点击目录项跳转到对应问题位置
- 默认收缩状态（窄条），鼠标悬停展开
- 支持搜索过滤问题
- 高亮当前视口内的问题

## 安装

1. 下载或克隆此仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目文件夹

## 使用

1. 打开 [Gemini](https://gemini.google.com/)
2. 开始对话或打开现有对话
3. 页面右侧会显示目录面板
4. 鼠标悬停展开目录
5. 点击问题跳转到对应位置

## 文件结构

```
gemini-chat-navigator/
├── manifest.json      # Chrome 扩展配置
├── content.js         # 主要逻辑脚本
├── styles.css         # 目录面板样式
├── popup.html         # 扩展弹窗
├── popup.js           # 弹窗脚本
├── icons/             # 扩展图标
└── README.md
```

## 许可证

MIT License
