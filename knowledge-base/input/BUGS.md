| CVE-2020-10281 | mavlink | MAVLink Cleartext Transmission of Sensitive Information      | Cleartext Transmission of Sensitive Information | 只要能接入 MAVLink 总线,攻击者就可以在无任何凭证的前提下伪造任意 MAVLink 节点 |
| -------------- | ------- | ------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------ |
| CVE-2020-10282 | mavlink | MAVLink Missing Authentication for Critical Function         | Missing Authentication for Critical Function    | 任何能接入 MAVLink 链路的攻击者都可以在无凭证的情况下伪造地面站、注入或篡改 MAVLink 消息 |
| CVE-2020-10283 | PX4     | MAVLink v2 to v1 Downgrade Authentication Bypass             | Improper Authentication                         | 严重情况下攻击者可以在无凭证、无交互的情况下接管无人机       |
| CVE-2021-34125 | PX4     | PX4 NuttX Commands Information Disclosure                    | Insufficient Information                        | 允许攻击者获取一些敏感信息                                   |
| CVE-2021-46896 | PX4     | PX4 MAVLink msgid 332 Buffer Overflow                        | Buffer Overflow                                 | 导致BOF文件崩溃                                              |
| CVE-2023-46256 | PX4     | PX4 Heap Buffer Overflow in Parser                           | Out-of-bounds Write和 Buffer Overflow           | 内存溢出导致无人机执行预期外的行为                           |
| CVE-2023-47625 | PX4     | PX4 CRSF Parser Global Buffer Overflow                       | Buffer Overflow                                 | 内存溢出导致无人机执行预期外的行为                           |
| CVE-2024-24255 | PX4     | PX4 Geofence/Mission Race Condition                          | Race Condition                                  | 使得无人机可以执行在禁飞区内飞行的任务                       |
| CVE-2024-29460 | PX4     | PX4 Home Point Manipulation / Flight Path Attack             | Improper Handling of Values                     | 无人机无法正确到达目标点,而是在附近不规则偏移                |
| CVE-2024-30799 | PX4     | PX4 Breach Return Point Vulnerability                        | QGC软件设计的问题?(没有找到这种错误叫什么)      | Breach Return Point无法发挥预期作用                          |
| CVE-2024-38951 | PX4     | PX4 DoS via Crafted MAVLink Message                          | Buffer Overflow                                 | 实现Denial of Service (DoS)攻击进而导致系统崩溃              |
| CVE-2024-38952 | PX4     | PX4 Logger Buffer Overflow                                   | Buffer Overflow                                 | 内存溢出进而导致系统崩溃                                     |
| CVE-2024-40427 | PX4     | PX4 Stack Buffer Overflow                                    | Buffer Overflow                                 | 在仿真中导致无人机拒绝执行                                   |
| CVE-2025-5640  | PX4     | PX4 TRAJECTORY_REPRESENTATION_WAYPOINTS Stack Buffer Overflow | Buffer Overflow                                 | 栈缓冲区溢出导致飞控进程崩溃,在仿真中表现为模拟器 crash,在真实飞行中可能导致无人机立刻失控或坠毁 |
| CVE-2025-9020  | PX4     | PX4 Mavlink Shell Closing Handler Use-After-Free             | Use After Free                                  | 导致飞控崩溃甚至在极端情况下实现远程代码执行,从而使无人机失控或被完全接管。 |

| CVE-2025-15150      | cve             | buffer_overflow       | High     | PX4 MavlinkLogHandler Stack Buffer Overflow                  |
| ------------------- | --------------- | --------------------- | -------- | ------------------------------------------------------------ |
| CVE-2026-32705      | cve             | buffer_overflow       | Medium   | PX4 BST Telemetry Stack Overflow with Code Execution         |
| CVE-2026-32706      | cve             | buffer_overflow       | Medium   | PX4 CRSF RC Parser Memory Corruption                         |
| CVE-2026-32707      | cve             | buffer_overflow       | Medium   | PX4 tattu_can Unbounded memcpy Stack Overflow                |
| CVE-2026-32708      | cve             | buffer_overflow       | Medium   | PX4 Zenoh Bridge Stack Overflow                              |
| CVE-2026-32709      | cve             | path_traversal        | Critical | PX4 MAVLink FTP Unauthenticated Path Traversal (CRITICAL)    |
| CVE-2026-32713      | cve             | authentication_bypass | High     | PX4 MAVLink FTP Session Isolation Bypass                     |
| CVE-2026-32724      | cve             | race_condition        | Medium   | PX4 MAVLink Shell Race Condition / UAF                       |
| CVE-2026-32743      | cve             | buffer_overflow       | Medium   | PX4 MavlinkLogHandler Stack Buffer Overflow                  |
| EDB-52339           | exploit         | buffer_overflow       | High     | PX4 Military UAV Autopilot 1.12.3 Stack-based Buffer Overflow (Public Exploit) |
| GH-ISSUE-18385      | github_issue    | oob_access            | High     | PX4 MAVLink msgID #147 Out-of-Bounds Access                  |
| GH-ISSUE-23251      | github_issue    | buffer_overflow       | High     | PX4 MAVLink Module Heap Overflow                             |
| GHSA-5hvv-q2r5-rppw | github_advisory | buffer_overflow       | High     | PX4 Lightware Laser Serial Parser Heap Buffer Overflow       |
| GHSL-2025-087       | github_advisory | supply_chain          | High     | PX4 CI/CD Pipeline Code Execution                            |
| MAVLINK-ISSUE-474   | github_issue    | buffer_overflow       | Medium   | MAVLink Library Buffer Overflow During Message Decoding      |1