## Kindle Dash
https://github.com/pascalw/kindle-dash
Copy dashboard to kindle from the `./kindle-dash` sub folder in this repo `scp -r * root@192.168.15.244:/mnt/us/dashboard/`

## SSH
SSH to kindle `ssh root@192.168.15.244`
On Windows it sometimes fails to connect, check the network settings and assign the IP 192.168.15.201 to the network.
No clue why it's that IP, source: https://www.mobileread.com/forums/showthread.php?t=340208

Disable the status bar using `lipc-set-prop com.lab126.pillow disableEnablePillow disable`

## Build and deploy
Build dash-image with `yarn build` and upload the zip file to the AWS lambda console

## Trouble shooting
If an event remains blank / has an undefined title it might be marked as private.