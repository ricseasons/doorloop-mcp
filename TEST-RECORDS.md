# DoorLoop test records to clean up

Records created while testing the MCP server and skills. Delete them in the DoorLoop web app when testing
is done, then remove the row here. Test writes go on 7307 Reservation Drive only
(property `6ad96a8e9a9b566b7e0bb3a6`), except where noted.

## Test leases (7307 Reservation Drive)

Created 2026-10-25 from the PDFs in `test-fixtures/`. Each lease starts 2026-11-01, so delete them before
then or rent starts posting.

| Unit | Lease | Tenant | Security deposit charge | $25 test charge (Late Fees) | Fixture |
| --- | --- | --- | --- | --- | --- |
| Apt 2 (`6ad96a909a9b566b7e0bb3f1`) | `6add8a51392b97a84059c9db` (ref 10dg09), $1,300/mo | API Test Tenant `6add8a51392b97a84059c9c8` | `6add8a52392b97a84059c9df` ($1,300) | `6add8a71466e3f2fcd1cd1e4` (ref h8ga27) | `test-lease-7307-apt2.pdf` |
| Apt 1 (`6ad96a909a9b566b7e0bb3dd`) | `6add8d6b845f537d89f1bd0b` (ref 6b4a7i), $1,200/mo | API Test Two `6add8d6b845f537d89f1bcf8` | `6add8d6b845f537d89f1bd0f` ($1,200) | `6add8d77845f537d89f1c120` (ref 6hh55f) | `test-lease-7307-apt1.pdf` |

Delete the charges first, then the lease, then the tenant (if DoorLoop doesn't remove it with the lease).

## Other test records

| What | Id | Where | Notes |
| --- | --- | --- | --- |
| Unit "API Test Unit" | `6adaef1812eb6d62b9152a71` | 7307 Reservation Drive | Added through Claude in Chrome 2026-10-23 |
| File "TEST-lease.pdf" | `6b03be1b66f35f6b8bd6be56` | Apt 2 test lease `6add8a51392b97a84059c9db` | Uploaded through Chrome 2026-11-23 to capture the upload request |
| Unit "Web Login Test" | `6b03bce2cf083d2a6200d9a1` | 7307 Reservation Drive | Added with `create_unit` and the saved web login 2026-11-23 |
| Subtask | `6adadedc7eb2a1d131e9521b` | 7307 task "Pest Control" `6ad9736b315f38741ee8102f` | Task-control skill test |
| Work order | `6adadede89ebd97822a3f534` | 7307 task "Pest Control" `6ad9736b315f38741ee8102f` | Task-control skill test |
| Subtask | `6ad99fdfa862267e62cdefa4` | 444 North Central Avenue #108, OKC | **Under a real tenant request** "Pest Control Needed" `6ad976e8cb42e65f873e5fa1`. Delete only the subtask, not the request |
| Work order | `6ad9a13215c7a7215609a1cf` | 444 North Central Avenue #108, OKC | **Under the same real tenant request**. Delete only the work order |

Keep the 7307 "Pest Control" task itself (`6ad9736b315f38741ee8102f`): it's the task used for testing.

## Not cleanup, but open

- 7307 Reservation Drive has no owner in DoorLoop. The test leases name Speights LLC (owner
  `68ba05efbfc920adbe5a0ad7`) as landlord.
