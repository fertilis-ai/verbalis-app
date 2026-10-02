import { Cpu } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { useShallow } from "zustand/react/shallow";
import {
  LOCAL_MODEL_ID,
  filterZdrModels,
  getActiveModels,
  getProviderLabel,
  type ChatModelId,
} from "@/lib/models";
import { isTauri } from "@/lib/storage";
import { ModelPicker } from "../model-picker";
import {
  DiscoverableModelSelect,
  ModelDiscoveryHeader,
  SETTINGS_SELECT_CLASS,
} from "../discoverable-model-select";
import { SettingsSectionLayout } from "../settings-section-layout";

export function ModelsSection() {
  const {
    defaultModel,
    setDefaultModel,
    localLLM,
    selectedModels,
    modelFetchStatus,
    modelFetchError,
    fetchModels,
    openRouterZdrOnly,
    setOpenRouterZdrOnly,
    apiKeys,
    imageModel,
    setImageModel,
    availableImageModels,
    imageModelFetchStatus,
    imageModelFetchError,
    fetchImageModels,
    transcriptionModel,
    setTranscriptionModel,
    availableTranscriptionModels,
    transcriptionModelFetchStatus,
    transcriptionModelFetchError,
    fetchTranscriptionModels,
    speechModel,
    setSpeechModel,
    speechVoice,
    setSpeechVoice,
    availableSpeechModels,
    speechModelFetchStatus,
    speechModelFetchError,
    fetchSpeechModels,
  } = useSettingsStore(
    useShallow((s) => ({
      defaultModel: s.defaultModel,
      setDefaultModel: s.setDefaultModel,
      localLLM: s.localLLM,
      selectedModels: s.selectedModels,
      modelFetchStatus: s.modelFetchStatus,
      modelFetchError: s.modelFetchError,
      fetchModels: s.fetchModels,
      openRouterZdrOnly: s.openRouterZdrOnly,
      setOpenRouterZdrOnly: s.setOpenRouterZdrOnly,
      apiKeys: s.apiKeys,
      imageModel: s.imageModel,
      setImageModel: s.setImageModel,
      availableImageModels: s.availableImageModels,
      imageModelFetchStatus: s.imageModelFetchStatus,
      imageModelFetchError: s.imageModelFetchError,
      fetchImageModels: s.fetchImageModels,
      transcriptionModel: s.transcriptionModel,
      setTranscriptionModel: s.setTranscriptionModel,
      availableTranscriptionModels: s.availableTranscriptionModels,
      transcriptionModelFetchStatus: s.transcriptionModelFetchStatus,
      transcriptionModelFetchError: s.transcriptionModelFetchError,
      fetchTranscriptionModels: s.fetchTranscriptionModels,
      speechModel: s.speechModel,
      setSpeechModel: s.setSpeechModel,
      speechVoice: s.speechVoice,
      setSpeechVoice: s.setSpeechVoice,
      availableSpeechModels: s.availableSpeechModels,
      speechModelFetchStatus: s.speechModelFetchStatus,
      speechModelFetchError: s.speechModelFetchError,
      fetchSpeechModels: s.fetchSpeechModels,
    }))
  );
  const speechVoices = availableSpeechModels.find((m) => m.id === speechModel)?.voices ?? [];
  const imageOptions = filterZdrModels(availableImageModels, openRouterZdrOnly, imageModel);
  const transcriptionOptions = filterZdrModels(
    availableTranscriptionModels,
    openRouterZdrOnly,
    transcriptionModel
  );
  const speechOptions = filterZdrModels(availableSpeechModels, openRouterZdrOnly, speechModel);
  const activeModels = getActiveModels(selectedModels);
  const localProviderLabel = getProviderLabel(localLLM.provider);
  const localModelLabel = localLLM.model.trim() || `${localProviderLabel} (default)`;
  const localOptionLabel = localLLM.enabled ? `Local LLM - ${localModelLabel}` : "Local LLM (disabled)";
  const options: Array<{ value: ChatModelId; label: string }> = [
    ...activeModels.map((model) => ({
      value: model.id,
      label: `${model.name} (${getProviderLabel(model.provider)})`,
    })),
    { value: LOCAL_MODEL_ID, label: localOptionLabel },
  ];
  // A stale default (e.g. the model was removed from discovery) is not a real
  // selection — show "None (disabled)" instead of silently showing option one.
  const hasDefaultModel = options.some((option) => option.value === defaultModel);

  const canFetch = isTauri();
  const hasOpenRouterKey = apiKeys.openrouter.trim();

  return (
    <SettingsSectionLayout id="models" icon={Cpu} title="Models" className="space-y-6">
      <div>
        <ModelDiscoveryHeader
          label="Text Model Discovery"
          onRefresh={fetchModels}
          isFetching={modelFetchStatus === "fetching"}
          error={modelFetchError}
          canFetch={canFetch}
          showDesktopHint
        />
        <label className="mt-2 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={openRouterZdrOnly}
            onChange={(e) => setOpenRouterZdrOnly(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <div>
            <span className="text-sm">Zero data retention</span>
            <p className="text-xs text-muted-foreground">
              Only show OpenRouter models served by endpoints that don't retain your data, and route all OpenRouter requests (chat, speech, transcription, images) to zero-retention endpoints only.
            </p>
          </div>
        </label>
        <div className="mt-2">
          <ModelPicker />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Default Text Model</label>
        <div className="mt-2">
          <select
            value={hasDefaultModel ? defaultModel : ""}
            onChange={(e) => setDefaultModel(e.target.value as ChatModelId)}
            className={SETTINGS_SELECT_CLASS}
          >
            <option value="">None (disabled)</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Used when the app starts and for new chats unless you change it in the model selector.
        </p>
      </div>

      {hasOpenRouterKey && (
        <DiscoverableModelSelect
          label="Image Model"
          onRefresh={fetchImageModels}
          isFetching={imageModelFetchStatus === "fetching"}
          error={imageModelFetchError}
          canFetch={canFetch}
          value={imageModel}
          onChange={setImageModel}
          options={imageOptions}
          hasFetched={availableImageModels.length > 0}
          emptyHint="Click Refresh to load OpenRouter image models."
          hint="Enables the generate_image chat tool. Images are saved to ~/.verbalis/images."
        />
      )}

      {hasOpenRouterKey && (
        <DiscoverableModelSelect
          label="Transcription Model"
          onRefresh={fetchTranscriptionModels}
          isFetching={transcriptionModelFetchStatus === "fetching"}
          error={transcriptionModelFetchError}
          canFetch={canFetch}
          value={transcriptionModel}
          onChange={setTranscriptionModel}
          options={transcriptionOptions}
          hasFetched={availableTranscriptionModels.length > 0}
          emptyHint="Click Refresh to load OpenRouter transcription models."
          hint="Enables the microphone button in chat for voice input."
        />
      )}

      {hasOpenRouterKey && (
        <DiscoverableModelSelect
          label="Speech Model"
          onRefresh={fetchSpeechModels}
          isFetching={speechModelFetchStatus === "fetching"}
          error={speechModelFetchError}
          canFetch={canFetch}
          value={speechModel}
          onChange={setSpeechModel}
          options={speechOptions}
          hasFetched={availableSpeechModels.length > 0}
          emptyHint="Click Refresh to load OpenRouter text-to-speech models."
          hint="Enables the read-aloud button on assistant replies."
        >
          {speechVoices.length > 0 && (
            <div className="mt-2">
              <label className="text-sm font-medium">Voice</label>
              <div className="mt-2">
                <select
                  value={speechVoice}
                  onChange={(e) => setSpeechVoice(e.target.value)}
                  className={SETTINGS_SELECT_CLASS}
                >
                  {speechVoices.map((voice) => (
                    <option key={voice} value={voice}>
                      {voice}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </DiscoverableModelSelect>
      )}
    </SettingsSectionLayout>
  );
}
