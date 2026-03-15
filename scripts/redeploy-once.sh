#!/usr/bin/env bash
# One-time redeploy trigger — runs once then removes itself from crontab
cd /home/jacobbarkley/claude/claw-dashboard
git commit --allow-empty -m "trigger: redeploy after limit reset"
git push
# Remove this job from crontab
crontab -l | grep -v "redeploy-once.sh" | crontab -
