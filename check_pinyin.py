# 严格核对 data.js 中 607 个汉字的拼音标注
# 用法: PYTHONPATH=<pkgs> python check_pinyin.py
import re, sys
from pypinyin import pinyin, Style

DATA = r"C:\Users\Nicky Gu\WorkBuddy\Claw\shizi\data.js"

with open(DATA, encoding="utf-8") as f:
    txt = f.read()

# 提取每个字的 {c:汉字, p:拼音}
pairs = re.findall(r'"c"\s*:\s*"([^"]*)"\s*,\s*"p"\s*:\s*"([^"]*)"', txt)
print(f"解析到 {len(pairs)} 个字\n")

def valid_reads(ch):
    try:
        res = pinyin(ch, style=Style.TONE, heteronym=True)
        return res[0] if res else []
    except Exception:
        return []

errors = []   # 确定错误：p 不在该字任何合法读音中
poly   = []   # 多音字：标注合法，但需人工确认课文语境

for ch, p in pairs:
    vr = valid_reads(ch)
    if not vr:
        errors.append((ch, p, "(pypinyin 无数据)"))
    elif p not in vr:
        errors.append((ch, p, "/".join(vr)))
    elif len(vr) > 1:
        poly.append((ch, p, "/".join(vr)))

print("=" * 60)
print("【A】确定错误（data.js 拼音不在该字任何合法读音中，必须改）")
print("=" * 60)
if not errors:
    print("  （无）")
for ch, p, vr in errors:
    print(f"  {ch}  data=\"{p}\"  正确应为: {vr}")

print("\n" + "=" * 60)
print(f"【B】多音字（标注合法，但需确认课文语境读音）共 {len(poly)} 个")
print("=" * 60)
for ch, p, vr in poly:
    default = vr.split("/")[0]
    flag = "✓默认" if p == default else "⚠非默认"
    print(f"  {ch}  标注=\"{p}\"  合法=[{vr}]  {flag}")

print(f"\n统计：确定错误 {len(errors)} 个，多音字 {len(poly)} 个")
