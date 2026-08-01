# 全量生成 607 个字的发音音频
# 方案：普通字用 edge-tts 纯文本（跨端一致、神经高音质、~1s）；
#       多音字中“教材读音≠常用读音”的例外字，用词组语境生成后截取目标音节，保证读音正确。
# 文件名按字符 Unicode codepoint 十六进制：assets/audio/u{code:x}.mp3
import asyncio, edge_tts, os, re, sys, subprocess, imageio_ffmpeg

ROOT = r"C:\Users\Nicky Gu\WorkBuddy\Claw\shizi"
DATA = os.path.join(ROOT, "data.js")
OUT = os.path.join(ROOT, "assets", "audio")
VOICE = "zh-CN-XiaoxiaoNeural"
os.makedirs(OUT, exist_ok=True)

FF = imageio_ffmpeg.get_ffmpeg_exe()

# 例外字：教材读音与 edge-tts 默认(常用)读音不同，用词组语境生成后截取目标音节
#   char: (carrier词组, 'first'第一个音节 / 'second'第二个音节)
EXCEPTIONS = {
    "行": ("银行", "second"),    # yín háng
    "转": ("转盘", "first"),     # zhuàn pán
    "当": ("上当", "second"),    # shàng dàng
    "重": ("重新", "first"),     # chóng xīn
    "笼": ("笼罩", "first"),     # lǒng zhào
    "杆": ("笔杆", "second"),    # bǐ gǎn
    "扎": ("扎染", "first"),     # zā rǎn
    "朝": ("朝阳", "first"),     # zhāo yáng
    "担": ("扁担", "second"),    # biǎn dàn
    "尽": ("尽力", "first"),     # jìn lì
    "倒": ("倒影", "first"),     # dào yǐng
    "曲": ("弯曲", "second"),    # wān qū
    "铺": ("床铺", "second"),    # chuáng pù
    "钉": ("钉子", "first"),     # dīng zi
}

def parse_chars():
    txt = open(DATA, encoding="utf-8").read()
    return re.findall(r'"c":\s*"([^"]*)",\s*"p":\s*"([^"]*)"', txt)

def filename_for(ch):
    return "u" + format(ord(ch), "x") + ".mp3"

def duration(p):
    r = subprocess.run([FF, "-i", p], capture_output=True, text=True)
    for l in r.stderr.splitlines():
        if "Duration" in l:
            m = re.search(r"(\d+):(\d+):(\d+\.\d+)", l)
            if m:
                h, m2, s = m.groups()
                return int(h)*3600 + int(m2)*60 + float(s)
    return 0.0

def find_gap(p):
    """找两音节之间的停顿中心，用于截取目标音节"""
    r = subprocess.run([FF, "-i", p, "-af", "silencedetect=n=-30dB:d=0.15", "-f", "null", "-"],
                       capture_output=True, text=True)
    segs = []
    cur = {}
    for l in r.stderr.splitlines():
        if "silence_start" in l:
            cur["s"] = float(l.split("silence_start:")[1].split()[0])
        elif "silence_end" in l and "s" in cur:
            e = float(l.split("silence_end:")[1].split()[0])
            cur["e"] = e
            segs.append((cur["s"], e))
            cur = {}
    # 取发生在 0.3s 之后、时长>0.15s 的第一个明显停顿
    for s, e in segs:
        if s > 0.3 and (e - s) > 0.15:
            return (s + e) / 2
    return None

def compress(src, dst):
    subprocess.run([FF, "-y", "-i", src, "-ac", "1", "-b:a", "24k", dst],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

sem = asyncio.Semaphore(8)

async def gen_one(char, py):
    fname = filename_for(char)
    final = os.path.join(OUT, fname)
    raw = os.path.join(OUT, "_raw_" + fname)
    # 决定生成文本
    if char in EXCEPTIONS:
        carrier, pos = EXCEPTIONS[char]
        text = carrier
    else:
        text = char
    for attempt in range(4):
        try:
            async with sem:
                await edge_tts.Communicate(text, VOICE).save(raw)
            # 例外字：截取目标音节
            if char in EXCEPTIONS:
                carrier, pos = EXCEPTIONS[char]
                D = duration(raw)
                gap = find_gap(raw)
                if pos == "first":
                    ss, t = 0.0, (gap if gap else D/2)
                else:
                    ss, t = (gap if gap else D/2), (D - (gap if gap else D/2))
                tmp = os.path.join(OUT, "_seg_" + fname)
                subprocess.run([FF, "-y", "-i", raw, "-ss", f"{ss:.3f}", "-t", f"{t:.3f}",
                                "-ac", "1", "-b:a", "24k", tmp],
                               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                os.remove(raw)
                os.replace(tmp, final)
            else:
                compress(raw, final)
                if os.path.exists(raw):
                    os.remove(raw)
            return True, fname, os.path.getsize(final)
        except Exception as e:
            await asyncio.sleep(1.5 * (attempt + 1))
    return False, fname, -1

async def main():
    pairs = parse_chars()
    total = len(pairs)
    print(f"共 {total} 个字（含 {len(EXCEPTIONS)} 个例外字走词组截取），开始生成到 {OUT}")
    done = ok = fail = 0
    for char, py in pairs:
        final = os.path.join(OUT, filename_for(char))
        if os.path.exists(final) and os.path.getsize(final) > 0:
            done += 1
            continue
        ok_flag, fname, size = await gen_one(char, py)
        done += 1
        if ok_flag:
            ok += 1
        else:
            fail += 1
            print(f"  [失败] {char} {py} -> {fname}", file=sys.stderr)
        if done % 50 == 0:
            print(f"  进度: {done}/{total} 成功 {ok} 失败 {fail}")
    print(f"完成. 新生成成功 {ok}, 失败 {fail}")

asyncio.run(main())
