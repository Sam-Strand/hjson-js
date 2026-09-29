<template>
    <h1>Hjson ↔ JSON</h1>
    <!-- ярус 1: Hjson → JS → JSON -->
    <div class="row">
        <div class="pane">
            <h2>Hjson (ввод)</h2>
            <textarea v-model="hjsonIn" @input="fromHjson" spellcheck="false"></textarea>
        </div>
        <div class="pane">
            <h2>JS представление</h2>
            <div class="tree">
                <TreeNode v-if="!hjsonError" :value="hjsonValue" />
                <div v-else class="error">{{ hjsonError }}</div>
            </div>
        </div>
        <div class="pane">
            <h2>JSON (результат)</h2>
            <textarea :value="jsonOut" readonly spellcheck="false"></textarea>
        </div>
    </div>

    <OptionsPanel v-model="opt" @update:model-value="fromHjson(); fromJson()" />

    <!-- ярус 2: JSON → JS → Hjson -->
    <div class="row">
        <div class="pane">
            <h2>JSON (ввод)</h2>
            <textarea v-model="jsonIn" @input="fromJson" spellcheck="false"></textarea>
        </div>
        <div class="pane">
            <h2>JS представление</h2>
            <div class="tree">
                <TreeNode v-if="!jsonError" :value="jsonValue" />
                <div v-else class="error">{{ jsonError }}</div>
            </div>
        </div>
        <div class="pane">
            <h2>Hjson (результат)</h2>
            <textarea :value="hjsonOut" readonly spellcheck="false"></textarea>
        </div>
    </div>
</template>
<script setup>
import { ref } from 'vue'
import Hjson from 'hjson'
import TreeNode from './TreeNode.vue'
import OptionsPanel from './OptionsPanel.vue'

import hjson_str from './test.hjson?raw'

const opt = ref({
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
})

// ---------- ярус 1: Hjson → JS → JSON ----------
const hjsonIn = ref(hjson_str)
const hjsonValue = ref(null)
const jsonOut = ref('')
const hjsonError = ref('')

function fromHjson() {
    hjsonError.value = ''
    try {
        const v = Hjson.parse(hjsonIn.value)
        hjsonValue.value = v
        jsonOut.value = JSON.stringify(v, null, 2)
    } catch (e) {
        hjsonError.value = String(e.message || e)
        jsonOut.value = ''
    }
}

// ---------- ярус 2: JSON → JS → Hjson ----------
const jsonIn = ref(JSON.stringify(Hjson.parse(hjson_str), null, 2))
const jsonValue = ref(null)
const hjsonOut = ref('')
const jsonError = ref('')

function fromJson() {
    jsonError.value = ''
    try {
        const v = JSON.parse(jsonIn.value)
        jsonValue.value = v
        hjsonOut.value = Hjson.stringify(v, opt.value)
    } catch (e) {
        jsonError.value = String(e.message || e)
        hjsonOut.value = ''
    }
}
// начальный прогон
fromHjson()
fromJson()
</script>