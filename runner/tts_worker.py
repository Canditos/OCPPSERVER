import sys
import os
import asyncio
import traceback
import edge_tts

# Fallback voice dictionary per language code prefix
FALLBACK_VOICES = {
    'pt': 'pt-PT-DuarteNeural',
    'en': 'en-US-GuyNeural',
    'es': 'es-ES-AlvaroNeural',
    'fr': 'fr-FR-HenriNeural',
    'de': 'de-DE-ConradNeural'
}

def get_fallback_voice(voice: str) -> str:
    v_lower = voice.lower()
    for prefix, fb in FALLBACK_VOICES.items():
        if v_lower.startswith(prefix) or f"-{prefix}-" in f"-{v_lower}-":
            return fb
    return 'en-US-GuyNeural'

async def synthesize(text: str, voice: str, out_path: str):
    tmp_path = out_path + '.tmp'
    try:
        communicate = edge_tts.Communicate(text, voice, volume='+100%')
        await communicate.save(tmp_path)
        if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 100:
            if os.path.exists(out_path):
                try:
                    os.remove(out_path)
                except Exception:
                    pass
            os.replace(tmp_path, out_path)
            return True
        else:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            return False
    except Exception as e:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
        raise e

async def main():
    if len(sys.argv) < 4:
        sys.stderr.write("Usage: python tts_worker.py <text> <voice> <output_file>\n")
        sys.exit(1)

    text = sys.argv[1]
    voice = sys.argv[2]
    out_path = sys.argv[3]

    try:
        success = await synthesize(text, voice, out_path)
        if not success:
            alt_voice = get_fallback_voice(voice)
            sys.stderr.write(f"Primary voice {voice} returned empty, trying {alt_voice}...\n")
            await synthesize(text, alt_voice, out_path)
    except Exception as e:
        sys.stderr.write(f"TTS Worker Error: {str(e)}\n")
        traceback.print_exc(file=sys.stderr)
        alt_voice = get_fallback_voice(voice)
        try:
            sys.stderr.write(f"Attempting fallback to {alt_voice}...\n")
            await synthesize(text, alt_voice, out_path)
        except Exception as e2:
            sys.stderr.write(f"Fallback voice also failed: {str(e2)}\n")
            sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())
