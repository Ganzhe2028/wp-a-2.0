import StudentHeader from "@/components/student/StudentHeader";

export const metadata = { title: "隐私说明" };
export default function PrivacyPage() {
  return <main className="ow-phone ow-enter"><StudentHeader title="PRIVACY" backHref="/login" /><p className="ow-kicker">YOUR WORK, YOUR CONTEXT</p><h1 className="ow-heading mt-2">隐私说明</h1><div className="student-prose mt-10"><section><h2>我们处理什么</h2><p>网站处理学校预置的账号标识、管理员维护的显示姓名与组别，以及你主动提交的 Day 1 图片和 Day 3 液位作品。</p></section><section><h2>谁可以浏览</h2><p>只有已登录且账号有效的活动成员可以进入前台。成员必须先提交自己的某个 Section，才能浏览其他人的同一 Section。</p></section><section><h2>匿名阶段</h2><p>活动切换到匿名模式后，前台只显示稳定的 8 位 Anonymous ID，不显示真实姓名。身份展示由服务器决定。</p></section><section><h2>图片</h2><p>请勿上传包含敏感信息的图片。系统会处理公开使用的图片版本；如需删除或更正，请联系活动管理员。</p></section><section><h2>账号安全</h2><p>不要向任何人透露密码。退出共享设备后，请使用页面中的“退出”按钮结束会话。</p></section></div></main>;
}
