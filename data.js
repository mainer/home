/* 默认数据 —— 首次打开时使用；之后所有修改都存在浏览器 localStorage 里。
   想换成你们自己的故事，可以：① 页面里点“编辑”直接改；② 改这个文件后清空浏览器数据；③ 用“导入备份”。 */
window.ROOM_DEFAULTS = {
  settings: {
    title: "我们的小屋",
    subtitle: "把一起走过的日子，挂在这面墙上",
    startDate: "2022-10-01"
  },
  memories: [
    {
      id: "m-2022-10-01",
      date: "2022-10-01",
      title: "秋天开始的地方",
      place: "图书馆 · 三楼靠窗",
      note: "第一次一起坐在窗边，外面的雨下得很轻。你把耳机分了一半给我，左耳是你听了一半的歌。那天谁也没有说喜欢，只是回宿舍的路走得特别慢。",
      photos: ["assets/photos/p1-lake-sunset.jpg"]
    },
    {
      id: "m-2022-12-24",
      date: "2022-12-24",
      title: "平安夜，街上全是灯",
      place: "老城区 · 步行街",
      note: "人挤人，你把围巾往上拉了拉，只露出一双眼睛。回头找我的时候，整条街的灯都在你身后。",
      photos: ["assets/photos/p6-night-bokeh.jpg"]
    },
    {
      id: "m-2023-04-08",
      date: "2023-04-08",
      title: "去湖边看了一次日落",
      place: "松花湖",
      note: "风很大，你的头发一直往我这边飞。太阳掉进水里的时候，我们都没说话，只是把手握得更紧了一点。",
      photos: ["assets/photos/p3-pink-lake.jpg"]
    },
    {
      id: "m-2023-07-21",
      date: "2023-07-21",
      title: "两个人的第一次旅行",
      place: "山里 · 无名湖",
      note: "凌晨四点出发，错过了日出，却在半山腰撞见一整片雾。你说这比日出好看，我说你比雾好看。",
      photos: ["assets/photos/p2-mountain-lake.jpg"]
    },
    {
      id: "m-2024-02-14",
      date: "2024-02-14",
      title: "只点了一盏灯的小馆",
      place: "城南 · 巷子深处",
      note: "你说这里的灯像家里。吃到一半，老板把音量调小，放了一首很旧的歌。那顿饭吃得很慢，好像谁都不想让这一晚结束。",
      photos: ["assets/photos/p4-warm-room.jpg"]
    },
    {
      id: "m-2024-08-30",
      date: "2024-08-30",
      title: "星河与帐篷",
      place: "高原 · 营地",
      note: "零下的夜里，我们把两张睡袋拼在一起。你数到第七颗流星就睡着了，剩下的我替你许了愿。",
      photos: ["assets/photos/p7-starry.jpg"]
    }
  ]
};
