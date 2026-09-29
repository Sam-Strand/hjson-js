<template>
    <template v-if="isBranch">
        <div class="branch">
            <div v-for="(v, k) in value" :key="k">
                <span class="key">{{ k }}</span><span class="punct">:</span>
                <TreeNode :value="v" />
            </div>
        </div>
    </template>
    <span v-else :class="cls">{{ display }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ value: null })

const isBranch = computed(
    () => props.value !== null && typeof props.value === 'object'
)
const cls = computed(() => {
    if (props.value === null) return 'null'
    return typeof props.value
})
const display = computed(() => {
    if (props.value === null) return 'null'
    if (typeof props.value === 'string') return JSON.stringify(props.value)
    return String(props.value)
})
</script>