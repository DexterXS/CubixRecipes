# CubixRecipes Wiki

## Поддерживаемые форматы
- `recipes.addShaped(<output>, [[...]]);`
- `recipes.addShaped("Name", <output>, [[...]]);`
- `mods.avaritia.ExtremeCrafting.addShaped(<output>, [[...9x9...]]);`

## Обозначения
- `null` — пустая ячейка.
- `<mod:item:2>` — строгая meta.
- `<mod:item:*>` — wildcard meta.

## Режимы
- Жёсткая привязка: матрица остаётся как есть.
- Нежёсткая привязка: в следующих итерациях будет использоваться trim/bounding box форма.

## Частые ошибки
- Пропуск `null` внутри shaped-рецепта.
- Незакрытые скобки и кавычки.
- Несоответствие item id между `.zs` и ресурсами.

## Ресурсы и анимации
- MVP индексирует textures/models/lang и помечает `.png.mcmeta` как animated.
- В будущих версиях UI сможет воспроизводить анимацию, а сейчас backend хранит метку для показа первого кадра.
