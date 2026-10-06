#!/bin/bash
# Build web → đồng bộ vào android/ → build APK debug → cài lên máy đang cắm → mở app (người dùng 2026-10-05)
set -e
cd "$(dirname "$0")/../.."
npx vite build --logLevel error
npx cap sync android > /dev/null
cd android
export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64} ANDROID_HOME=${ANDROID_HOME:-$HOME/Android/Sdk}
./gradlew assembleDebug -q 2>&1 | grep -v "^$" | tail -5 || true
A=$ANDROID_HOME/platform-tools/adb
$A install -r app/build/outputs/apk/debug/app-debug.apk | tail -1
$A shell am force-stop com.endfield.aicplanner
$A shell am start -n com.endfield.aicplanner/.MainActivity > /dev/null
echo deployed
