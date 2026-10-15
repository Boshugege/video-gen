// 本期的句子。顺序就是成片里的出场顺序；on: false 的句子不进成片（但仍占用配色序号）。
// 改句子 = 改这个文件，然后 npm run preview / render。
//   roman：音节，空格分开；非拉丁文字建议填罗马拼音。不填时拉丁文字自动切音节，其他文字每个字算一个音节
//   rtl：从右往左书写（花瓣也逆时针生长）
export const SENTENCES = [
  { lang: '中文', text: '我想你', roman: 'wo xiang ni', zh: '"想"也是"思考"', en: 'Literally: I think of you' },
  { lang: 'Français', text: 'Tu me manques', roman: 'tu me mank', zh: '直译：你从我这里缺席了', en: 'Literally: You are missing from me' },
  { lang: 'Español', text: 'Te extraño', roman: 'te eks tra nyo', zh: '"extrañar"与"陌生"同源', en: 'From the word for "strange"' },
  { lang: '日本語', text: '会いたい', roman: 'a i ta i', zh: '直译：想见面', en: 'Literally: I want to meet you' },
  { lang: '한국어', text: '보고 싶어', roman: 'bo go si peo', zh: '直译：想看见你', en: 'Literally: I want to see you' },
  { lang: 'Kiswahili', text: 'Nakukumbuka', roman: 'na ku kum bu ka', zh: '直译：我记得你', en: 'Literally: I remember you' },
  { lang: 'العربية', text: 'اشتقت إليك', roman: 'ish taq tu i layk', zh: '直译：我渴望过你', en: 'Literally: I longed for you', rtl: true },
  { lang: 'Português', text: 'Saudades de você', roman: 'sau da des de vo ce', zh: 'saudade：一种无法翻译的思念', en: 'Saudade: a longing with no translation' },
];

// 每句一个色相，按句子在列表里的位置循环取。
export const HUES = [346, 18, 42, 150, 188, 214, 258, 298, 8, 120, 230, 320];
