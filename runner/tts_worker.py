import sys
import os
import asyncio
import traceback
import edge_tts

async def synthesize(text: str, voice: str, out_path: str):
    tmp_path = out_path + '.tmp'
    try:
        communicate = edge_tts.Communicate(text, voice)
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
            # Fallback to alternate European Portuguese voice DuarteNeural if RaquelNeural failed
            alt_voice = 'pt-PT-DuarteNeural' if 'pt-PT' in voice else 'en-US-GuyNeural'
            sys.stderr.write(f"Primary voice {voice} returned empty, trying {alt_voice}...\n")
            await synthesize(text, alt_voice, out_path)
    except Exception as e:
        sys.stderr.write(f"TTS Worker Error: {str(e)}\n")
        traceback.print_exc(file=sys.stderr)
        # Try alternate European Portuguese voice
        if 'pt-PT' in voice:
            try:
                sys.stderr.write("Attempting fallback to pt-PT-DuarteNeural...\n")
                await synthesize(text, 'pt-PT-DuarteNeural', out_path)
            except Exception as e2:
                sys.stderr.write(f"Fallback voice also failed: {str(e2)}\n")
                sys.exit(1)
        else:
            sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())
