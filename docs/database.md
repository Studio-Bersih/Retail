# 🗄️ Database & Schema Design

## 1. 📦 Product (Item)
The fundamental unit of inventory.
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier / SKU |
| `name` | `string` | Display name |
| `price` | `number` | Unit price (IDR) |
| `category` | `string` | Product grouping |
| `stock` | `number` | Current quantity in active outlet |

## 2. 👤 Member
Customer loyalty and tracking data.
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Member ID / Phone number |
| `name` | `string` | Full name |
| `points` | `number` | Loyalty points |
| `lastTransaction`| `date` | Recency tracking |

## 3. 🧾 Transaction
The record of a completed sale.
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique invoice number |
| `date` | `timestamp`| Execution time |
| `cashierId` | `string` | Responsible user |
| `outletId` | `string` | Sale location |
| `total` | `number` | Final amount paid |
| `status` | `enum` | `Completed`, `Pending`, `Void` |

## 4. 🏪 Outlet
Physical branch information.
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique branch ID |
| `name` | `string` | Branch name |
| `location` | `string` | Address / City |
| `phone` | `string` | Contact number |
