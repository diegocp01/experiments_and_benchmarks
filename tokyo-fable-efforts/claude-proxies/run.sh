#!/bin/bash
cd "$HOME/mnt/Downloads"
for n in lows meds highs xhighs; do
  ffmpeg -y -v error -i $n.mov -vf "fps=30,scale=2560:-2:flags=lanczos" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k tokyo/claude-proxies/$n.tmp.mp4 && mv tokyo/claude-proxies/$n.tmp.mp4 tokyo/claude-proxies/$n.mp4
done
echo done > tokyo/claude-proxies/DONE
