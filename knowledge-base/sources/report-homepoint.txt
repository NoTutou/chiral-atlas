### Summary
This state management bug will result in the drone being unable to reach the waypoint and thus continuing the mission.And continues to drift irregularly near the waypoints.
PX4-Autopilot v1.14.0

### Details
1. When the drone is executing a mission, PX4 calculates the distance between the drone and the current target waypoint, and checks if it has reached the vicinity.

   Here calculates the distance.
https://github.com/Drone-Lab/PX4-Autopilot/blob/3f81b71dfc956c3803852584dd9488adda9dee6e/src/modules/navigator/mission_block.cpp#L198-L202
   When mission altitude mode is **Relative to Launch** `mission_item_altitude_amsl=mission_item.altitude + home_alt`

   And here checks whether it is less than the acceptable radius.
https://github.com/Drone-Lab/PX4-Autopilot/blob/3f81b71dfc956c3803852584dd9488adda9dee6e/src/modules/navigator/mission_block.cpp#L395-L396

2. When the drone is executing a mission, if the user modifies the home point to a new location (with a different altitude), the value of 'dist' will immediately change based on the new home point's altitude (which determines the check for whether the drone has reached the waypoint). However, the current actual executed 'mission_item' does not get updated.

   This will result in a discrepancy between the actual executed target of the drone and the checked completion target, causing the drone to start randomly oscillating near the waypoint.

![image](https://github.com/PX4/PX4-Autopilot/assets/151698793/59782bec-8394-4621-9250-27d0e4ec038e)


### Verification

We added some debug output to watch the drone's state change,and found every time the user changes the home point, 'dist_z' (altitude) also changes accordingly, but the 'mission_item' does not.

### Temporary Patch

There are currently two patching approaches based on the expectations for how the drone should operate after modifying the home point: 
1. After changing the drone's home point altitude, the currently executed mission target should also change immediately 
2. Once the mission is uploaded and completed, the 'mission_item' should no longer change, even if the home altitude changes; the waypoint altitude should remain relative to the altitude at the time of mission upload

I have open a pull request.https://github.com/PX4/PX4-Autopilot/pull/22834

### Impact
- This vulnerability could be exploited by attackers for covert attacks
- When a benign user modifies the home point while the drone is executing a mission, the drone may oscillate, come into contact with surrounding obstacles, and ultimately crash
- Modifying the home point to a new location during the mission execution will result in the drone randomly drifting near the next waypoint. This could lead to collisions and crashes.https://github.com/PX4/PX4-Autopilot/issues/22576



https://github.com/PX4/PX4-Autopilot/assets/151698793/273dd910-c92e-4817-8385-45c7ad38c3f8

Some bugs prevent you from directly viewing the video.You can **download** and check this vedio.

![image](https://github.com/PX4/PX4-Autopilot/assets/151698793/41d03721-bdd4-4e6d-a1ec-e6b47780ffb5)


