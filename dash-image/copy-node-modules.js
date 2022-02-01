import copyNodeModules from 'copy-node-modules';

const srcDir = './';
const dstDir = './dist';
copyNodeModules(srcDir, dstDir, { devDependencies: false }, () => {});
