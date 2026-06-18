const { test, expect } = require("@playwright/test");

test.describe("口令解析单元测试", () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto("/index.html");
    await page.waitForSelector("#grid");
  });

  test.afterAll(async () => {
    await page.close();
  });

  async function evalTest(fn) {
    return page.evaluate(fn);
  }

  test("parseSinglePattern：别名归一化（匡→仓、咚→冬、七→才、令→台）", async () => {
    const result = await evalTest(() => {
      const T = window.__luoguTest;
      const r = T.parseSinglePattern("匡 咚 七 令");
      return {
        p00: r.pattern[0][0],
        p11: r.pattern[1][1],
        p22: r.pattern[2][2],
        p33: r.pattern[3][3],
      };
    });
    expect(result.p00).toBe("仓");
    expect(result.p11).toBe("冬");
    expect(result.p22).toBe("才");
    expect(result.p33).toBe("台");
  });

  test("parseSinglePattern：一拍多字连写（匡令同时击打）", async () => {
    const result = await evalTest(() => {
      const T = window.__luoguTest;
      const r = T.parseSinglePattern("匡令 0 0 0");
      return { p00: r.pattern[0][0], p30: r.pattern[3][0] };
    });
    expect(result.p00).toBe("仓");
    expect(result.p30).toBe("台");
  });

  test("parseSinglePattern：休止符（0/乙/×）", async () => {
    const result = await evalTest(() => {
      const T = window.__luoguTest;
      const r = T.parseSinglePattern("0 乙 × 空");
      let allEmpty = true;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          if (r.pattern[row][col] !== "") allEmpty = false;
        }
      }
      return { allEmpty };
    });
    expect(result.allEmpty).toBe(true);
  });

  test("parseSinglePattern：双竖线分隔小节", async () => {
    const result = await evalTest(() => {
      const T = window.__luoguTest;
      const r = T.parseSinglePattern("仓 才 仓 才 || 冬 台 冬 台");
      return {
        measureCount: r.measureCount,
        p00: r.pattern[0][0],
        p14: r.pattern[1][4],
      };
    });
    expect(result.measureCount).toBe(2);
    expect(result.p00).toBe("仓");
    expect(result.p14).toBe("冬");
  });

  test("parseSectionHeader：提取 BPM 和小节范围", async () => {
    const result = await evalTest(() => {
      const T = window.__luoguTest;
      const h = T.parseSectionHeader("# 慢板: 120 BPM [1-4小节]");
      return { name: h.name, bpm: h.bpm, range: h.measureRange };
    });
    expect(result.name).toBe("慢板");
    expect(result.bpm).toBe(120);
    expect(result.range).toEqual({ start: 1, end: 4 });
  });

  test("parseCommand：多段落解析", async () => {
    const result = await evalTest(() => {
      const T = window.__luoguTest;
      const input =
        "# 慢板: 120 BPM [1-4小节]\n仓 才 仓 才 || 0 0 0 0\n" +
        "# 快板: 140 [5-8小节]\n冬 冬 台 台 || 才 才 才 才";
      const r = T.parseCommand(input);
      return {
        isMulti: r.isMultiSection,
        count: r.sections.length,
        s0name: r.sections[0].name,
        s0bpm: r.sections[0].bpm,
        s1name: r.sections[1].name,
        s1bpm: r.sections[1].bpm,
      };
    });
    expect(result.isMulti).toBe(true);
    expect(result.count).toBe(2);
    expect(result.s0name).toBe("慢板");
    expect(result.s0bpm).toBe(120);
    expect(result.s1name).toBe("快板");
    expect(result.s1bpm).toBe(140);
  });
});
