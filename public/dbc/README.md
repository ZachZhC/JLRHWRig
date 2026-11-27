# 默认 DBC（每页一份）

把默认 DBC 放到这个目录，文件名固定：

- `swm.dbc` —— SWM Testing
- `sws.dbc` —— SWS Testing
- `wdcm.dbc` —— WDCM Testing

页面启动时如果这个页面没手动导入过 DBC，会自动加载对应的默认文件
（请求地址 `dbc/<page>.dbc`）。文件不存在就显示 `No DBC`，不点亮任何键。

- 页面 Trace 头栏最右的 **Input DBC** 可以随时替换，导入过的文件存在浏览器里，
  刷新/重启不丢，并且优先于这里的默认文件。
- 改这里的文件后刷新页面即可生效；**不需要重新构建**（`public/` 会原样拷进 `dist/`）。