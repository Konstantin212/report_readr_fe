const FileInput = (props: Omit<React.HTMLAttributes<HTMLInputElement>, 'className' | 'type'>) => {
  return (
    <div>
      <label className="block mb-2 text-sm font-medium text-white" htmlFor="file_input">
        Upload file
      </label>
      <input
        className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
        type="file"
        id="file_input"
        {...props}
      />
    </div>
  );
};

export default FileInput;
