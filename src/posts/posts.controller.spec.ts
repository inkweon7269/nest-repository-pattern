import { Test, TestingModule } from '@nestjs/testing';
import { PostsController } from './posts.controller';
import { PostsFacade } from './posts.facade';
import { PostResponseDto } from './dto/response/post.response.dto';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';

describe('PostsController', () => {
  let controller: PostsController;
  let mockFacade: jest.Mocked<PostsFacade>;

  const now = new Date();

  const mockResponseDto: PostResponseDto = {
    id: 1,
    title: 'Test Title',
    content: 'Test Content',
    isPublished: false,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    mockFacade = {
      getAllPosts: jest.fn(),
      getPostById: jest.fn(),
      createPost: jest.fn(),
    } as unknown as jest.Mocked<PostsFacade>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [{ provide: PostsFacade, useValue: mockFacade }],
    }).compile();

    controller = module.get<PostsController>(PostsController);
  });

  describe('getAllPosts', () => {
    it('should delegate to facade and return the result', async () => {
      mockFacade.getAllPosts.mockResolvedValue([mockResponseDto]);

      const result = await controller.getAllPosts();

      expect(mockFacade.getAllPosts).toHaveBeenCalled();
      expect(result).toEqual([mockResponseDto]);
    });
  });

  describe('getPostById', () => {
    it('should delegate to facade and return the result', async () => {
      mockFacade.getPostById.mockResolvedValue(mockResponseDto);

      const result = await controller.getPostById(1);

      expect(mockFacade.getPostById).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockResponseDto);
    });
  });

  describe('createPost', () => {
    it('should delegate to facade and return the result', async () => {
      const dto: CreatePostRequestDto = {
        title: 'New Post',
        content: 'New Content',
      };
      mockFacade.createPost.mockResolvedValue(mockResponseDto);

      const result = await controller.createPost(dto);

      expect(mockFacade.createPost).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockResponseDto);
    });
  });
});
