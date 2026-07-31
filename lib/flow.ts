export const DAY1_PROMPTS = [
  "头像",
  "喜欢的食物",
  "喜欢的音乐",
  "最喜欢的动物",
  "我的颜色",
  "最近天气",
  "此刻心情",
  "想去的地方",
  "最近在读",
  "一件重要的东西",
  "最喜欢的电影",
  "我的日常",
  "最近在学",
  "一张旧照片",
  "今天的我",
] as const;

export const DAY3_SECTIONS = [
  {
    title: "快乐源泉的小瓶子",
    subtitle: "哪些是你快乐的源泉，晒晒你的小快乐吧！",
    prompts: ["放学回家", "喜欢的食物", "喜欢的人", "逛街", "打游戏", "飞歌", "猫", "狗", "看电影", "找到有趣的事儿做", "坚持运动", "被人夸", "收到礼物", "收红包", "奶茶", "垃圾食品", "好友闲聊", "把酒言欢", "睡觉", "躺着刷手机", "下午茶", "听到喜欢的歌", "种植", "出门手机满电", "旅行", "大海", "森林", "出国", "晒太阳", "花", "雪", "雨"],
  },
  {
    title: "安心小瓶子",
    subtitle: "总有让你安心的办法！",
    prompts: ["家里", "自己房间", "被子里", "手机有电", "有WiFi", "人多的地方", "学校", "图书馆", "安静的乡村", "梦里", "父母在身边", "夜市", "吃饱之后", "太阳照射的地方", "发工资了", "有存款", "每天醒来", "与朋友吃烧烤", "听喜欢的音乐", "做瑜伽", "带宠物散步", "牵爱人的手散步", "摸猫", "钓鱼", "下小雨的晚上", "人少的地方", "阅读", "美食", "香水", "美颜滤镜", "被肯定", "减肥成功"],
  },
] as const;

export type Day3Answers = number[][];

export function parseDay3Answers(value: unknown): Day3Answers {
  if (!Array.isArray(value)) return DAY3_SECTIONS.map((section) => section.prompts.map(() => 0));
  return DAY3_SECTIONS.map((section, sectionIndex) =>
    section.prompts.map((_, promptIndex) => {
      const answer = (value as unknown[][])[sectionIndex]?.[promptIndex];
      return typeof answer === "number" && Number.isInteger(answer) && answer >= 0 && answer <= 5 ? answer : 0;
    }),
  );
}