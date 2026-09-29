<template>
    <div class="options-panel">
        <h2>Настройки</h2>

        <!-- Кавычки -->
        <fieldset>
            <legend>Кавычки</legend>
            <label>
                Режим
                <select v-model="local.quotes">
                    <option value="min">min — минимум кавычек</option>
                    <option value="keys">keys — все ключи</option>
                    <option value="strings">strings — все строки</option>
                    <option value="all">all — всё в кавычках</option>
                </select>
            </label>
            <label>
                Символ
                <select v-model="local.quoteChar">
                    <option value='"'>" (двойная)</option>
                    <option value="'">' (одинарная)</option>
                </select>
            </label>
        </fieldset>

        <!-- Форматирование -->
        <fieldset>
            <legend>Форматирование</legend>
            <label>
                Отступ (space)
                <input v-model.number="local.space" type="number" min="0" max="8" />
            </label>
            <label>
                EOL
                <select v-model="local.eol">
                    <option value="\n">LF (\n)</option>
                    <option value="\r\n">CRLF (\r\n)</option>
                </select>
            </label>
            <label class="check">
                <input v-model="local.bracesSameLine" type="checkbox" />
                bracesSameLine
            </label>
            <label class="check">
                <input v-model="local.emitRootBraces" type="checkbox" />
                emitRootBraces
            </label>
            <label class="check">
                <input v-model="local.separator" type="checkbox" />
                separator (запятые)
            </label>
            <label class="check">
                <input v-model="local.sortProps" type="checkbox" />
                sortProps
            </label>
            <label class="check">
                <input v-model="local.keepWsc" type="checkbox" />
                keepWsc
            </label>
        </fieldset>

        <!-- Multiline / condense -->
        <fieldset>
            <legend>Multiline / condense</legend>
            <label>
                multiline
                <select v-model="local.multiline">
                    <option value="std">std</option>
                    <option value="no-tabs">no-tabs</option>
                    <option value="off">off</option>
                </select>
            </label>
            <label>
                condense
                <input v-model.number="local.condense" type="number" min="0" />
            </label>
        </fieldset>

        <!-- Разное -->
        <fieldset>
            <legend>Разное</legend>
            <label class="check">
                <input v-model="local.colors" type="checkbox" />
                colors
            </label>
        </fieldset>

        <button type="button" @click="reset">Сбросить</button>
    </div>
</template>

<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
    modelValue: { type: Object, required: true },
})
const emit = defineEmits(['update:modelValue'])

function defaults() {
    return {
        quotes: 'min',
        quoteChar: '"',
        space: 2,
        eol: '\n',
        bracesSameLine: false,
        emitRootBraces: true,
        separator: false,
        sortProps: false,
        keepWsc: false,
        multiline: 'std',
        condense: 0,
        colors: false,
    }
}

const local = reactive({ ...defaults(), ...props.modelValue })

// локальное изменение → наружу
watch(local, () => {
    emit('update:modelValue', { ...local })
})

// внешнее изменение → внутрь
watch(
    () => props.modelValue,
    (v) => {
        Object.assign(local, defaults(), v)
    },
    { deep: true },
)

function reset() {
    Object.assign(local, defaults())
}
</script>

<style scoped>
.options-panel {
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 6px 8px;
    margin-bottom: 8px;
    font: 12px/1.3 system-ui, sans-serif;
}

.options-panel h2 {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 600;
}

/* группы идут подряд, без сетки на всю ширину */
fieldset {
    border: 1px solid #e5e5e5;
    border-radius: 3px;
    margin: 0 0 4px;
    padding: 2px 6px 4px;
}

legend {
    padding: 0 3px;
    color: #999;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

/* каждая строка — inline, без гридов */
label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0 8px 2px 0;
    white-space: nowrap;
}

label.check {
    gap: 3px;
}

/* компактные контролы фиксированной ширины */
select,
input[type='number'] {
    font: inherit;
    padding: 1px 3px;
    height: 20px;
    border: 1px solid #ccc;
    border-radius: 3px;
    background: #fff;
    box-sizing: border-box;
    vertical-align: middle;
}

select {
    width: 7.5em;
}

input[type='number'] {
    width: 3.5em;
}

input[type='checkbox'] {
    margin: 0;
    width: 13px;
    height: 13px;
    accent-color: #4a90d9;
}

button {
    margin-top: 2px;
    padding: 2px 8px;
    font: inherit;
    height: 20px;
    border: 1px solid #ccc;
    border-radius: 3px;
    background: #f7f7f7;
    cursor: pointer;
}

button:hover {
    background: #eee;
}
</style>