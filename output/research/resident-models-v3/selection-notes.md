# 选角实查

实际下载并渲染的候选共九个原始 VRM：AvatarSample_A/B/C、Sendagaya Shibu/Shino、Sakurada Fumiriya、Vivi、Vita、Victoria Rubin。

采用五个不同基础：A、C、Shibu、Shino、Fumiriya。
排除 B 的幻想发饰、Vita 的科幻装扮、Vivi 与 Victoria 的不适合武汉日常的幻想/过短服装，未把其预览肖像误当成成熟居民成品。

现成免费样例没有真正的成熟老人脸。最终采用完整外部模型，并明确记录灰发、眼部比例、下颌与年龄纹理为本地美术改编，而非宣称下载到了老人。

静态预览经验：VRM 即使无动画仍需 vrm.update 更新 MToon 材质 uniforms；只更新 humanoid 会使原始 A/C 的 alpha 被显示为黑色衣服模板。已经用原始 A 重现，完整更新解决。原始 beta 春骨在 rotateVRM0 后立即更新容易让头发穿过脸；最终居民关闭独立春骨，发型保留原始绑定关系。
