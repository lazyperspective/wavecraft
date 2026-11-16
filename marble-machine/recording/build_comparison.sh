#!/usr/bin/env bash
# Builds the comparison video from the two individual recordings.
#   1. title card
#   2. Opus 5.5 (high) solo, full screen with its own audio
#   3. Fable 5.2 (medium) solo, full screen with its own audio
#   4. side by side; Opus audio leans left, Fable audio leans right
#   5. end card
# usage: build_comparison.sh [solo_seconds] [split_start] [split_seconds]
#   env SPEED=2 plays the footage twice as fast; START, TITLE_S, SC_S, END_S, LX, LY: see below
set -euo pipefail
cd "${PROJECT:-$(dirname "$0")/..}"   # PROJECT=<folder> builds another test's comparison
T_NAME=${T_NAME:-Glass & Brass}
T_SUB=${T_SUB:-a musical marble machine in a single HTML file}
SPLIT_SUB=${SPLIT_SUB:-Opus in your left ear · Fable in your right}
END_Q=${END_Q:-Which would you watch twice?}
A_SUB=${A_SUB:-high · left ear}; B_SUB=${B_SUB:-medium · right ear}
SOLO=${1:-26}; SPLIT_AT=${2:-30}; SPLIT=${3:-20}   # seconds of source footage
SPEED=${SPEED:-1}; START=${START:-0}                # playback speed; where the solo clips start
TITLE_S=${TITLE_S:-5}; SC_S=${SC_S:-3}; END_S=${END_S:-5}   # card lengths
LX=${LX:-80}; LY=${LY:-940}                         # name label position in the solo clips
SOLO_O=$(echo "scale=3; $SOLO/$SPEED"|bc); SPLIT_O=$(echo "scale=3; $SPLIT/$SPEED"|bc)
A=${A:-videos/opus-5.5-high.mp4}
B=${B:-videos/fable-5.2-medium.mp4}
OUT=${OUT:-videos/comparison.mp4}
FL=/usr/share/fonts/opentype/inter/Inter-Light.otf
FM=/usr/share/fonts/opentype/inter/Inter-Medium.otf
FS=/usr/share/fonts/opentype/inter/Inter-SemiBold.otf
BG=0x0d0c0b; FPS=30

card() { # $1 = drawtext chain, $2 = seconds
  echo "color=c=${BG}:s=1920x1080:r=${FPS}:d=$2,format=yuv420p,$1,fade=t=in:d=0.6,fade=t=out:st=$(echo "$2-0.6"|bc|sed 's/^\./0./'):d=0.6"
}
label() { # $1 text, $2 sub, $3 x, $4 y
  echo "drawbox=x=$(( $3 - 24 )):y=$(( $4 - 20 )):w=440:h=104:color=black@0.45:t=fill,drawtext=fontfile=${FS}:text='$1':fontsize=38:fontcolor=white:x=$3:y=$4,drawtext=fontfile=${FL}:text='$2':fontsize=24:fontcolor=white@0.75:x=$3:y=$(( $4 + 50 ))"
}

TITLE=$(card "drawtext=fontfile=${FL}:text='ONE PROMPT · TWO MODELS':fontsize=28:fontcolor=0xc9a46a:x=(w-tw)/2:y=390,drawtext=fontfile=${FS}:text='${T_NAME}':fontsize=110:fontcolor=white:x=(w-tw)/2:y=440,drawtext=fontfile=${FL}:text='${T_SUB}':fontsize=34:fontcolor=white@0.7:x=(w-tw)/2:y=590,drawtext=fontfile=${FM}:text='Opus 5.5 (high)   vs   Fable 5.2 (medium)':fontsize=34:fontcolor=white@0.9:x=(w-tw)/2:y=680" $TITLE_S)
SPLITCARD=$(card "drawtext=fontfile=${FS}:text='Side by side':fontsize=80:fontcolor=white:x=(w-tw)/2:y=470,drawtext=fontfile=${FL}:text='${SPLIT_SUB}':fontsize=32:fontcolor=white@0.7:x=(w-tw)/2:y=580" $SC_S)
ENDCARD=$(card "drawtext=fontfile=${FS}:text='${END_Q}':fontsize=72:fontcolor=white:x=(w-tw)/2:y=470,drawtext=fontfile=${FL}:text='Same creative brief, word for word. Both builds are one self-contained HTML file.':fontsize=30:fontcolor=white@0.7:x=(w-tw)/2:y=580" $END_S)

ffmpeg -y -loglevel error -stats \
  -i "$A" -i "$B" \
  -f lavfi -t $TITLE_S -i "anullsrc=r=48000:cl=stereo" \
  -f lavfi -t $SC_S -i "anullsrc=r=48000:cl=stereo" \
  -f lavfi -t $END_S -i "anullsrc=r=48000:cl=stereo" \
  -filter_complex "
  ${TITLE}[t];
  ${SPLITCARD}[sc];
  ${ENDCARD}[e];
  [0:v]trim=${START}:$(echo "$START+$SOLO"|bc),setpts=(PTS-STARTPTS)/${SPEED},fps=${FPS},scale=1920:1080:flags=lanczos,setsar=1,$(label 'Opus 5.5' 'high reasoning effort' $LX $LY),fade=t=in:d=0.6,fade=t=out:st=$(echo "$SOLO_O-0.6"|bc):d=0.6,format=yuv420p[va];
  [0:a]atrim=${START}:$(echo "$START+$SOLO"|bc),asetpts=PTS-STARTPTS,atempo=${SPEED},afade=t=in:d=0.4,afade=t=out:st=$(echo "$SOLO_O-0.8"|bc):d=0.8[aa];
  [1:v]trim=${START}:$(echo "$START+$SOLO"|bc),setpts=(PTS-STARTPTS)/${SPEED},fps=${FPS},scale=1920:1080:flags=lanczos,setsar=1,$(label 'Fable 5.2' 'medium reasoning effort' $LX $LY),fade=t=in:d=0.6,fade=t=out:st=$(echo "$SOLO_O-0.6"|bc):d=0.6,format=yuv420p[vb];
  [1:a]atrim=${START}:$(echo "$START+$SOLO"|bc),asetpts=PTS-STARTPTS,atempo=${SPEED},afade=t=in:d=0.4,afade=t=out:st=$(echo "$SOLO_O-0.8"|bc):d=0.8[ab];
  [0:v]trim=${SPLIT_AT}:$((SPLIT_AT+SPLIT)),setpts=(PTS-STARTPTS)/${SPEED},fps=${FPS},scale=944:531:flags=lanczos,setsar=1[sa];
  [1:v]trim=${SPLIT_AT}:$((SPLIT_AT+SPLIT)),setpts=(PTS-STARTPTS)/${SPEED},fps=${FPS},scale=944:531:flags=lanczos,setsar=1[sb];
  color=c=${BG}:s=1920x1080:r=${FPS}:d=${SPLIT_O}[bg];
  [bg][sa]overlay=16:274[bg1];[bg1][sb]overlay=960:274,
    drawtext=fontfile=${FS}:text='Opus 5.5':fontsize=40:fontcolor=white:x=16+(944-tw)/2:y=850,
    drawtext=fontfile=${FL}:text='${A_SUB}':fontsize=24:fontcolor=white@0.6:x=16+(944-tw)/2:y=905,
    drawtext=fontfile=${FS}:text='Fable 5.2':fontsize=40:fontcolor=white:x=960+(944-tw)/2:y=850,
    drawtext=fontfile=${FL}:text='${B_SUB}':fontsize=24:fontcolor=white@0.6:x=960+(944-tw)/2:y=905,
    fade=t=in:d=0.6,fade=t=out:st=$(echo "$SPLIT_O-0.8"|bc):d=0.8,format=yuv420p[vs];
  [0:a]atrim=${SPLIT_AT}:$((SPLIT_AT+SPLIT)),asetpts=PTS-STARTPTS,atempo=${SPEED},pan=stereo|c0=0.85*c0+0.85*c1|c1=0.15*c0+0.15*c1[pl];
  [1:a]atrim=${SPLIT_AT}:$((SPLIT_AT+SPLIT)),asetpts=PTS-STARTPTS,atempo=${SPEED},pan=stereo|c0=0.15*c0+0.15*c1|c1=0.85*c0+0.85*c1[pr];
  [pl][pr]amix=inputs=2:normalize=0,afade=t=in:d=0.4,afade=t=out:st=$(echo "$SPLIT_O-1"|bc):d=1[as];
  [t][2:a][va][aa][vb][ab][sc][3:a][vs][as][e][4:a]concat=n=6:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$OUT"
echo "wrote $OUT"
