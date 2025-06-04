import React from 'react';
import { XMarkIcon, PhotoIcon } from './Icons'; // PhotoIcon might be optional here if only used for button

interface ImageGenModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPrompt: string;
  setUserPrompt: (prompt: string) => void;
  onGenerate: () => Promise<void>;
  generatedImageUrl: string | null;
  isLoading: boolean;
  error: string | null;
  submittedPrompt: string | null;
  isApiConfigured: boolean;
}

const ImageGenModal: React.FC<ImageGenModalProps> = ({
  isOpen,
  onClose,
  userPrompt,
  setUserPrompt,
  onGenerate,
  generatedImageUrl,
  isLoading,
  error,
  submittedPrompt,
  isApiConfigured
}) => {
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isApiConfigured) {
        onGenerate();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-lg transform transition-all scale-100 opacity-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center">
            <PhotoIcon className="w-6 h-6 mr-2 text-accent" />
            Generate Image
          </h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close image generation modal"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        
        {!isApiConfigured && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                Image generation is unavailable. Please ensure the API key is correctly configured.
            </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="imagePrompt" className="block text-sm font-medium text-gray-700 mb-1">
              Image Prompt
            </label>
            <textarea
              id="imagePrompt"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-accent focus:border-accent disabled:bg-gray-50"
              placeholder="e.g., A futuristic cityscape at sunset, synthwave style"
              aria-required="true"
              disabled={isLoading || !isApiConfigured}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !userPrompt.trim() || !isApiConfigured}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-green-600 rounded-md shadow-sm transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              'Generate Image'
            )}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700" role="alert">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {generatedImageUrl && !error && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Generated Image:</h3>
            {submittedPrompt && <p className="text-xs text-gray-500 mb-2 italic">Prompt: "{submittedPrompt}"</p>}
            <div className="bg-gray-100 p-2 rounded-md border border-gray-200 flex justify-center items-center">
                <img 
                    src={generatedImageUrl} 
                    alt={submittedPrompt || "Generated image"} 
                    className="max-w-full max-h-64 md:max-h-80 rounded-md shadow" 
                />
            </div>
          </div>
        )}
         {isLoading && !generatedImageUrl && (
            <div className="mt-6 text-center text-gray-600">
                <p>Creating your image, please wait...</p>
                {submittedPrompt && <p className="text-xs text-gray-500 mt-1 italic">Working on: "{submittedPrompt}"</p>}
            </div>
        )}
      </div>
    </div>
  );
};

export default ImageGenModal;