### Background
CVE-2024-24255 version <=1.14

PX4 (6.9k stars) https://github.com/PX4/PX4-Autopilot

PX4 is a professional autopilot system developed by world-class developers from both the industry and academia. Supported by an active global community, it provides power for a variety of vehicles, including racing and cargo drones, ground vehicles, and submarines. Due to code reusability, this vulnerability should be applicable not only to multirotor drones but also to fixed-wing drones, submarines, ground vehicles, and more.

The open-source project's code is directly utilized by numerous OEM drone manufacturers worldwide, including Freefly Systems, Quantum Systems, Skydio, Auterion, and others.

### Summary
Due to the lack of synchronization mechanism for loading geofence data,we identified a Race Condition vulnerability in the geofence.cpp and mission_feasibility_checker.cpp.This will result in the drone uploading overlapping geofences and mission routes.But, as expected, MissionFeasibilityChecker should prevent the uploading.

### Impact
- Due to multiple threads accessing the geofence data, checher is dysfunctional.
- Due to this vulnerability, users may unintentionally or intentionally execute missions within the no-fly zone after performing the following sequence of actions: triggering the vulnerability to bypass mission feasibility check, uploading waypoints within the no-fly zone, setting the home point within the no-fly zone, turn to return mode to bring the drone into the no-fly zone, and then switching to mission mode, causing the drone to execute the mission within the no-fly zone starting from the nearest waypoint.

https://user-images.githubusercontent.com/151698793/295128951-3176e8fc-60ab-49e9-9dd3-4ef64523c62d.mp4

### Details

1. When the ground control station upload mission or geofence to the drone.In geofence.cpp, there is a state machine designed to read geofence data from ourb and load it onto the drone, as illustrated in the following picture.
   <p align="center">
     <img src="https://user-images.githubusercontent.com/151698793/294857321-53c6d894-448a-4130-85ae-30ab7e12e171.png" width="622" />
   </p>
   This functionality is called within a while(1) loop in navigator_main.cpp.

   https://github.com/Drone-Lab/PX4-Autopilot/blob/cf840ff3731d8bebf65e79bd8c9c7bbd8d29d404/src/modules/navigator/navigator_main.cpp#L893  
The read and load operations within it utilize **asynchronous** reading, ensuring that they do not block the function loop.
https://github.com/Drone-Lab/PX4-Autopilot/blob/cf840ff3731d8bebf65e79bd8c9c7bbd8d29d404/src/modules/navigator/geofence.cpp#L111-L112
https://github.com/Drone-Lab/PX4-Autopilot/blob/cf840ff3731d8bebf65e79bd8c9c7bbd8d29d404/src/modules/navigator/geofence.cpp#L155-L163
 
2. When the ground control station upload mission or geofence to the drone.In mission_feasibility_checker.cpp, **synchronous** reading is employed to retrieve updates for the mission, and to check for potential conflicts between the mission and geofence.
https://github.com/Drone-Lab/PX4-Autopilot/blob/20129e63facab129ad31fa693d1397e7458afaa4/src/modules/navigator/mission_feasibility_checker.cpp#L122-L123
This functionality is called within a while(1) loop in navigator_main.cpp too.
https://github.com/Drone-Lab/PX4-Autopilot/blob/20129e63facab129ad31fa693d1397e7458afaa4/src/modules/navigator/navigator_main.cpp#L873-L877

3. This is the cause of the issue. When on the ground control station, both the geofence and mission are updated simultaneously. The geofence undergoes multiple state transitions through the state machine (with each state transition requiring the execution of a while(1) loop), and it is only after asynchronous reading that the geofence data can be loaded for the mission_feasibility_checker to examine.
Therefore, when the mission_feasibility_checker utilizes synchronous reading to obtain mission data, the geofence data involved in the check has not yet been updated. Consequently, the check is performed with outdated geofence data, resulting in the failure of the checker.


### Verification
I added some debug output to watch the drone's geofence data update.

We have observed that, after clicking "UPLOAD" in QGC, the updating of the geofence lags behind the mission updates and feasibility_check by several rounds in the loop.

When the drone is executing a mission and the user clicks UPLOAD,the console will output the following content:

```
...
INFO  [navigator] loop
INFO  [navigator] loop
INFO  [navigator] update mission    //load the new mission data
INFO  [navigator] loop
INFO  [navigator] check feasibility   //triger check function
INFO  [navigator] loop   
INFO  [navigator] loop             
INFO  [navigator] loop   
INFO  [navigator] loop   
INFO  [navigator] update geofence  //Here load geofence data,but the feasibility checking has finshed
INFO  [navigator] loop
INFO  [navigator] loop
...
```
### Temporary Patch

Now, the check function is only present in the mission module. This is unreasonable.

When GCS update the geofence, we need the mission feasibility checks to be run immediately.

We can accomplish the above by simply adding the same check to the geofence.Like this:Add mission point check when update the geofence #22531

In the main branch now, someone noticed the potential issue with this checker's effectiveness. However, their solution is to perform the check again just before the drone takes off. This can address some problems since, after some time, the geofence data is updated to the latest. However, they did not recognize that the fundamental cause of the issue is data race due to multithreading, and this approach introduces new problems. We and the contributor discussed this in [#1261](https://github.com/PX4/PX4-Autopilot/pull/22394#issuecomment-1858063715).

>Currently, the same upload button doesn't trigger a check when updating only the fence, only updating the mission triggers a check, which I think is patently unreasonable.
>For example, a scenario like this: a user plans a task in advance and passes the check, is ready to execute it some time later, but doesn't get a notification that the task is not compliant until just before execution.



### Appendix
We have obtained the CNVD ID of this vulnerability.

<img src="https://github.com/Drone-Lab/PX4-Autopilot/assets/151698793/edcc1255-d900-42fc-9b25-40e4efd02a48" alt="Your Image" width="700">




