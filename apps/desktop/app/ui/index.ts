// Public surface of the UI kit. Import from '~/ui' rather than individual files.

// Actions
export { default as Button } from './Button.vue'
export { default as IconButton } from './IconButton.vue'
export { default as Spinner } from './Spinner.vue'

// Overlays
export { default as Tooltip } from './Tooltip.vue'
export { default as Popover } from './Popover.vue'
export { default as Menu } from './Menu.vue'
export { default as MenuList } from './MenuList.vue'
export { default as ContextMenu } from './ContextMenu.vue'
export { default as ListItem } from './ListItem.vue'
export { default as Dialog } from './Dialog.vue'
export { default as Sheet } from './Sheet.vue'

// Inputs
export { default as Input } from './Input.vue'
export { default as Textarea } from './Textarea.vue'
export { default as NumberField } from './NumberField.vue'
export { default as Select } from './Select.vue'
export { default as Combobox } from './Combobox.vue'
export { default as MultiCombobox } from './MultiCombobox.vue'
export { default as SegmentedControl } from './SegmentedControl.vue'
export { default as StatePicker, type StyleState, type StateOption } from './StatePicker.vue'
export { default as Slider } from './Slider.vue'
export { default as Switch } from './Switch.vue'
export { default as Checkbox } from './Checkbox.vue'
export { default as ColorField } from './ColorField.vue'
export { default as ColorPicker } from './ColorPicker.vue'
export { default as ColorArea } from './ColorArea.vue'
export { default as ColorSlider } from './ColorSlider.vue'
export { default as Swatch } from './Swatch.vue'
export { default as ColorTokenPalette } from './ColorTokenPalette.vue'
export { default as DateField } from './DateField.vue'
export { default as FileDrop } from './FileDrop.vue'

// Layout
export { default as Tabs } from './Tabs.vue'
export { default as SplitPane } from './SplitPane.vue'
export { default as Panel } from './Panel.vue'
export { default as PanelSection } from './PanelSection.vue'
export { default as PropertyRow } from './PropertyRow.vue'
export { default as FieldGroup } from './FieldGroup.vue'
export { default as Divider } from './Divider.vue'
export { default as ScrollArea } from './ScrollArea.vue'
export { default as Kbd } from './Kbd.vue'
export { default as TreeItem } from './TreeItem.vue'
export { default as EmptyState } from './EmptyState.vue'
export { default as Badge, type BadgeTone } from './Badge.vue'

// Data
export { default as DataTable } from './DataTable.vue'
export { default as JsonTree } from './JsonTree.vue'
export { default as SchemaForm } from './SchemaForm.vue'
export { default as SortableList } from './SortableList.vue'
export { default as KeyValueEditor } from './KeyValueEditor.vue'
export { default as CodeBlock } from './CodeBlock.vue'

// Types
export type { ColorToken, KeyValuePair, DataTableColumn, ComboboxOption, MenuEntry, MenuItem, MenuSeparator, MenuGroupLabel, SelectOption, SegmentOption, TabItem, ControlSize, SplitPaneItem } from './types'
export { isMenuItem, colorTokenVar } from './types'

// Pure helpers
export { parseDimension, formatDimension, cssToDimension, UNITS, type Unit, type Dimension, type ParseOptions } from './lib/units'
export {
  parseColor,
  hexToRgba,
  rgbaToHex,
  rgbaToHsva,
  hsvaToRgba,
  hsvaToHex,
  parseRgbFunction,
  tokenLabel,
  type Rgba,
  type Hsva,
  type ParsedColor,
} from './lib/color'
export { formatShortcut, parseShortcut, matchesShortcut, isMacPlatform, type ParsedShortcut } from './lib/shortcut'
export { nextSort, sortRows, selectRange, virtualWindow, type TableSort, type SortDirection, type VirtualWindow } from './lib/table'
export { parseValue as parseDateValue, buildValue as buildDateValue, monthGrid, addDays, addMonths, isoDate, type CalendarDay, type DateParts } from './lib/calendar'
export { acceptsFile, checkFiles, formatBytes, type FileRejection, type FileRejectReason } from './lib/files'
export { formatPath, parsePath, getAtPath, setAtPath, moveItem, type PathSegment } from './lib/jsonPath'
export {
  flattenJson,
  expandedToDepth,
  jsonType,
  copyText,
  previewValue,
  JSON_TREE_PAGE_SIZE,
  JSON_TREE_MAX_DEPTH,
  type JsonType,
  type JsonTreeRow,
  type JsonNodeRow,
  type JsonMoreRow,
  type JsonTreeSelectEvent,
  type JsonTreeCopyEvent,
} from './lib/jsonTree'
export {
  resolveSchema,
  fieldKind,
  fieldLabel,
  enumOptions,
  emptyValue,
  schemaDefaults,
  validateSchema,
  type JsonSchema,
  type JsonSchemaType,
  type JsonPrimitive,
  type SchemaFieldKind,
  type SchemaIssue,
  type ResolvedSchema,
  type ValidateOptions,
} from './lib/jsonSchema'
export type { SchemaFieldSlotProps } from './lib/schemaFormContext'
export { slotToMove, applyMove, type SortableMove, type SortablePosition, type SortableHandleProps } from './lib/sortable'
export { clamp, roundTo, formatNumber, decimalsOf } from './lib/number'
export { normalizeSizes, pairBounds, resizePanes, type PaneLimits } from './lib/splitPane'

// Composables (for editor features building their own widgets)
export { useScrub, type ScrubOptions } from './composables/useScrub'
export { useListNavigation, type ListNavigationOptions } from './composables/useListNavigation'
export { usePointerDrag, type DragPoint, type PointerDragOptions } from './composables/usePointerDrag'
export { useDismissableLayer, type DismissReason } from './composables/useDismissableLayer'
export { useFloatingSurface, type FloatingSurfaceOptions, type Placement } from './composables/useFloatingSurface'
export { useClipboard, type Clipboard } from './composables/useClipboard'
export { usePersistentState } from './composables/usePersistentState'
export { useComboboxSource, filterOptions, type ComboboxSearch, type ComboboxSourceOptions } from './composables/useComboboxSource'
export { useModal, focusableIn, type ModalOptions } from './composables/useModal'
export {
  provideUiKit,
  provideLayerStack,
  provideTooltipGroup,
  createLayerStack,
  createTooltipGroup,
  type LayerStack,
  type TooltipGroup,
} from './composables/uiContext'
