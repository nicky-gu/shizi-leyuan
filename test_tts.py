# 验证：用 edge-tts + SSML <phoneme> 强制按指定拼音生成发音，跨端一致
import asyncio, edge_tts, os

OUT = r"C:\Users\Nicky Gu\WorkBuddy\Claw\shizi\audio_test"
os.makedirs(OUT, exist_ok=True)

# 把带调拼音（háng）转成数字声调（hang2），供 phoneme 使用
TONE_MAP = {'ā':('a',1),'á':('a',2),'ǎ':('a',3),'à':('a',4),
            'ō':('o',1),'ó':('o',2),'ǒ':('o',3),'ò':('o',4),
            'ē':('e',1),'é':('e',2),'ě':('e',3),'è':('e',4),
            'ī':('i',1),'í':('i',2),'ǐ':('i',3),'ì':('i',4),
            'ū':('u',1),'ú':('u',2),'ǔ':('u',3),'ù':('u',4),
            'ǖ':('v',1),'ǘ':('v',2),'ǚ':('v',3),'ǜ':('v',4),'ü':('v',5),
            'ń':('n',2),'ň':('n',3),'ǹ':('n',4),'ḿ':('m',2)}
def to_num(py):
    out=''; tone=5
    for ch in py:
        if ch in TONE_MAP:
            out += TONE_MAP[ch][0]; tone = TONE_MAP[ch][1]
        else:
            out += ch
    return out + str(tone)

async def gen(char, py, name):
    num = to_num(py)
    ssml = (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">'
            f'<voice name="zh-CN-XiaoxiaoNeural">'
            f'<phoneme alphabet="py" ph="{num}">{char}</phoneme>'
            f'</voice></speak>')
    c = edge_tts.Communicate(ssml, "zh-CN-XiaoxiaoNeural")
    path = os.path.join(OUT, name)
    await c.save(path)
    print(f"  生成 {name}: {char} -> 拼音 {py} (phoneme {num})  size={os.path.getsize(path)}B")

async def main():
    # 两个易错多音字：行(应读háng)、得(应读轻声de)
    await gen("行", "háng", "hang.mp3")
    await gen("得", "de",  "de.mp3")
    print("完成，样本在", OUT)

asyncio.run(main())
