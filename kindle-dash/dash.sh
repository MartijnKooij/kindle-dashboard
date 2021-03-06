DEBUG=${DEBUG:-false}
[ $DEBUG = true ] && set -x

DIR="$(dirname $0)"
DASH_PNG="$DIR/dash.png"
FETCH_DASHBOARD_CMD="$DIR/local/fetch-dashboard.sh"
LOW_BATTERY_CMD="$DIR/local/low-battery.sh"

REFRESH_SCHEDULE=${REFRESH_SCHEDULE:-"2,32 8-17 * * MON-FRI"}
FULL_DISPLAY_REFRESH_RATE=${FULL_DISPLAY_REFRESH_RATE:-0}
SLEEP_SCREEN_INTERVAL=${SLEEP_SCREEN_INTERVAL:-3600}
RTC=/sys/devices/platform/mxc_rtc.0/wakeup_enable

LOW_BATTERY_REPORTING=${LOW_BATTERY_REPORTING:-false}
LOW_BATTERY_THRESHOLD_PERCENT=${LOW_BATTERY_THRESHOLD_PERCENT:-10}

num_refresh=0

init() {
  if [ \( -z "$TIMEZONE" \) -o \( -z "$REFRESH_SCHEDULE" \) ]; then
    echo "Missing required configuration."
    echo "Timezone: ${TIMEZONE:-(not set)}."
    echo "Schedule: ${REFRESH_SCHEDULE:-(not set)}."
    exit 1
  fi

  echo "Starting dashboard with $REFRESH_SCHEDULE refresh..."

  # /etc/init.d/framework stop
  lipc-set-prop com.lab126.pillow disableEnablePillow disable
  initctl stop webreader > /dev/null 2>&1
  echo powersave > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
  lipc-set-prop com.lab126.powerd preventScreenSaver 1
}

prepare_sleep() {
  echo "Preparing sleep"

  /usr/sbin/eips -f -g "$DIR/sleeping.png"
  
  # Give screen time to refresh
  sleep 2
}

refresh_dashboard() {
  echo "Refreshing dashboard"
  "$DIR/wait-for-wifi.sh" "$WIFI_TEST_IP"

  "$FETCH_DASHBOARD_CMD" "$DASH_PNG"

  if [ $num_refresh -eq $FULL_DISPLAY_REFRESH_RATE ]; then
    num_refresh=0

    # trigger a full refresh once in every 4 refreshes, to keep the screen clean
    echo "Full screen refresh"
    /usr/sbin/eips -f -g "$DASH_PNG"
  else
    echo "Partial screen refresh"
    /usr/sbin/eips -g "$DASH_PNG"
  fi

  num_refresh=$((num_refresh+1))
}

log_battery_stats() {
  battery_level=$(gasgauge-info -c)
  echo "$(date) Battery level: $battery_level."

  if [ $LOW_BATTERY_REPORTING = true ]; then
    battery_level_numeric=${battery_level%?}
    if [ $battery_level_numeric -le $LOW_BATTERY_THRESHOLD_PERCENT ]; then
      "$LOW_BATTERY_CMD" $battery_level_numeric
    fi
  fi
}

rtc_sleep() {
  duration=$1

  if [ $DEBUG = true ]; then
    sleep $duration
  else
    [ $(cat "$RTC") -eq 0 ] && echo -n "$duration" > "$RTC"
    echo "mem" > /sys/power/state
  fi
}

main_loop() {
  while true ; do
    log_battery_stats

    next_wakeup_secs=$("$DIR/next-wakeup" --schedule="$REFRESH_SCHEDULE" --timezone="$TIMEZONE")

    if [ $next_wakeup_secs -gt $SLEEP_SCREEN_INTERVAL ]; then
      action="sleep"
      prepare_sleep
    else
      action="suspend"
      refresh_dashboard
    fi

    # take a bit of time before going to sleep, so this process can be aborted
    sleep 30

    echo "Going to $action, next wakeup in ${next_wakeup_secs}s"

    rtc_sleep $next_wakeup_secs
  done
}

init
main_loop
